#!/usr/bin/env python3
"""
CC Monitor launcher — borderless GTK/WebKit desktop widget.
"""

import json
import os
import subprocess
import threading
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gdk, GLib, Gtk, WebKit2

try:
    import psutil

    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    print("Warning: python3-psutil not found — system stats disabled.")
    print("  Fix: sudo apt install python3-psutil")

here = os.path.dirname(os.path.abspath(__file__))
html_uri = "file://" + os.path.join(here, "monitor.html")

# ── XDG user directories ──────────────────────────────────────────
# CONFIG_DIR / CACHE_DIR here are the exact same paths install.sh and
# uninstall.sh already know about — this is deliberate, so "remove my
# settings" in uninstall.sh actually removes everything, not just
# window position.
XDG_CONFIG_HOME = os.environ.get(
    "XDG_CONFIG_HOME", os.path.join(os.path.expanduser("~"), ".config")
)
XDG_CACHE_HOME = os.environ.get(
    "XDG_CACHE_HOME", os.path.join(os.path.expanduser("~"), ".cache")
)
CONFIG_DIR = os.path.join(XDG_CONFIG_HOME, "cc-widget")
CACHE_DIR = os.path.join(XDG_CACHE_HOME, "cc-widget")
os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# Window position is user state — kept out of the install directory
# since install.sh wipes and replaces that wholesale on every upgrade.
WINDOW_POS_FILE = os.path.join(CONFIG_DIR, "window_pos.json")

# WebKit's own site data (this is where cfg — token, theme, layout —
# actually lives, via the page's localStorage). Left unconfigured,
# WebKit falls back to $XDG_DATA_HOME/<prgname>/..., and prgname
# defaults to argv[0]'s basename — i.e. literally "launch.py" when
# run as `python3 launch.py`. Pointing it here explicitly instead
# means: a sensible, known location; consistent behavior regardless
# of how/where launch.py is invoked from; and uninstall.sh's existing
# CONFIG_DIR/CACHE_DIR cleanup actually reaches this data.
WEBKIT_DATA_DIR = os.path.join(CONFIG_DIR, "webkit-data")
WEBKIT_CACHE_DIR = os.path.join(CACHE_DIR, "webkit-cache")
os.makedirs(WEBKIT_DATA_DIR, exist_ok=True)
os.makedirs(WEBKIT_CACHE_DIR, exist_ok=True)

# Also give the process a real name instead of inheriting "launch.py"
# — mostly cosmetic (window-manager/task-switcher labeling), but
# there's no reason to leave it as an accident of how the script
# happens to be invoked.
GLib.set_prgname("cc-widget")
GLib.set_application_name("CC Widget")

# ── WebKit settings ───────────────────────────────────────────────
ws = WebKit2.Settings()
ws.set_allow_universal_access_from_file_urls(True)
ws.set_allow_file_access_from_file_urls(True)
ws.set_javascript_can_open_windows_automatically(False)

data_manager = WebKit2.WebsiteDataManager(
    base_data_directory=WEBKIT_DATA_DIR,
    base_cache_directory=WEBKIT_CACHE_DIR,
)
web_context = WebKit2.WebContext.new_with_website_data_manager(data_manager)

# ── Network rate tracking (needs delta between calls) ─────────────
_prev_net = None
_prev_net_time = None


def get_net_rates():
    global _prev_net, _prev_net_time
    if not HAS_PSUTIL:
        return {"rx_mbps": 0.0, "tx_mbps": 0.0}
    now = time.monotonic()
    try:
        net = psutil.net_io_counters()
    except Exception:
        return {"rx_mbps": 0.0, "tx_mbps": 0.0}
    if _prev_net is None:
        _prev_net, _prev_net_time = net, now
        return {"rx_mbps": 0.0, "tx_mbps": 0.0}
    dt = max(now - _prev_net_time, 0.1)
    rx = (net.bytes_recv - _prev_net.bytes_recv) / dt / 1_048_576
    tx = (net.bytes_sent - _prev_net.bytes_sent) / dt / 1_048_576
    _prev_net, _prev_net_time = net, now
    return {"rx_mbps": round(max(0.0, rx), 2), "tx_mbps": round(max(0.0, tx), 2)}


# ── Folder size tracking (du-based, async) ────────────────────
_folder_paths = []
_folder_sizes = {}  # path -> gb (cached; updated by background threads)
_folder_sizes_lock = threading.Lock()


def _compute_one_folder(path):
    """Run du -sb on a single path and cache the result."""
    try:
        result = subprocess.run(
            ["du", "-sb", "--", path],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0:
            bytes_val = int(result.stdout.split()[0])
            gb = round(bytes_val / 1024**3, 3)
            with _folder_sizes_lock:
                _folder_sizes[path] = gb
    except Exception:
        pass


def _refresh_folder_sizes():
    """Kick off a background thread for each watched folder path."""
    for path in list(_folder_paths):
        t = threading.Thread(target=_compute_one_folder, args=(path,), daemon=True)
        t.start()


manager = WebKit2.UserContentManager()
win = None
webview = None


def on_message(mgr, result):
    global _folder_paths
    try:
        msg = result.get_js_value().to_string()
    except Exception as e:
        print("MSG ERROR:", e)
        return

    if msg == "close":
        Gtk.main_quit()
    elif msg == "minimize":
        win.iconify()
    elif msg == "pin":
        win.set_keep_above(True)
    elif msg == "unpin":
        win.set_keep_above(False)
    elif msg.startswith("resize:"):
        try:
            parts = msg.split(":")
            if len(parts) == 3:
                w, h = int(parts[1]), int(parts[2])
            else:
                w, h = win.get_size()[0], int(parts[1])
            w = max(300, min(w, 1200))
            h = max(200, min(h, 1400))
            GLib.idle_add(lambda w=w, h=h: win.resize(w, h) or False)
        except Exception as e:
            print("Resize error:", e)
    elif msg.startswith("watch:"):
        # JS sends the full folder-path list whenever it changes
        try:
            new_paths = json.loads(msg[6:])
            with _folder_sizes_lock:
                # Evict cache for paths no longer watched
                for p in list(_folder_sizes):
                    if p not in new_paths:
                        del _folder_sizes[p]
            _folder_paths = new_paths
            # Kick off immediate refresh for any newly added paths
            _refresh_folder_sizes()
        except Exception as e:
            print("Watch parse error:", e)
    elif msg.startswith("dragstart"):
        try:
            win.begin_move_drag(
                1, *win.get_pointer()[1:3], Gtk.get_current_event_time()
            )
        except Exception:
            pass


manager.connect("script-message-received::ccm", on_message)
manager.register_script_message_handler("ccm")

# ── Filesystem types to skip ──────────────────────────────────────
SKIP_FS = {
    "tmpfs",
    "devtmpfs",
    "squashfs",
    "overlay",
    "proc",
    "sysfs",
    "devpts",
    "cgroup",
    "cgroup2",
    "hugetlbfs",
    "mqueue",
    "debugfs",
    "tracefs",
    "bpf",
    "fusectl",
    "configfs",
    "pstore",
    "efivarfs",
    "securityfs",
    "ramfs",
    "autofs",
    "nsfs",
}


# ── System stats push (Python → JS every 2 s) ────────────────────
def push_stats():
    if webview is None:
        return True

    if not HAS_PSUTIL:
        js = "if(window.onLinuxStats)window.onLinuxStats({unavailable:true})"
        webview.evaluate_javascript(js, -1, None, None)
        return True

    try:
        vm = psutil.virtual_memory()
        swap = psutil.swap_memory()
        cpu_freq = psutil.cpu_freq()
        net = get_net_rates()

        disks = {}
        for part in psutil.disk_partitions(all=False):
            if not part.fstype or part.fstype in SKIP_FS:
                continue
            if part.device.startswith(("/dev/loop", "/dev/ram")):
                continue
            try:
                u = psutil.disk_usage(part.mountpoint)
                disks[part.mountpoint] = {
                    "device": part.device,
                    "percent": round(u.percent, 1),
                    "used_gb": round(u.used / 1024**3, 1),
                    "free_gb": round(u.free / 1024**3, 1),
                    "total_gb": round(u.total / 1024**3, 1),
                }
            except (PermissionError, OSError):
                pass

        # Folder sizes (du-based, cached from background threads)
        with _folder_sizes_lock:
            folder_sizes = dict(_folder_sizes)
        # Kick off async refresh for next tick
        _refresh_folder_sizes()

        stats = {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "cpu_freq_ghz": round(cpu_freq.current / 1000, 2) if cpu_freq else None,
            "cpu_freq_max": round(cpu_freq.max / 1000, 2)
            if cpu_freq and cpu_freq.max
            else None,
            "ram_percent": vm.percent,
            "ram_used_gb": round(vm.used / 1024**3, 2),
            "ram_free_gb": round(vm.available / 1024**3, 2),
            "ram_total_gb": round(vm.total / 1024**3, 2),
            "swap_percent": swap.percent,
            "swap_used_gb": round(swap.used / 1024**3, 2),
            "swap_total_gb": round(swap.total / 1024**3, 2),
            "disks": disks,
            "net": net,
            "folder_sizes": folder_sizes,
        }
    except Exception as e:
        stats = {"error": str(e)}

    js = f"if(window.onLinuxStats)window.onLinuxStats({json.dumps(stats)})"
    webview.evaluate_javascript(js, -1, None, None)
    return True


def load_window_pos():
    try:
        with open(WINDOW_POS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"x": 1500, "y": 50}


def save_window_pos():
    if win is None:
        return
    try:
        x, y = win.get_position()
        with open(WINDOW_POS_FILE, "w") as f:
            json.dump({"x": x, "y": y}, f)
    except Exception:
        pass


# ── WebView ───────────────────────────────────────────────────────
# Built from the explicit web_context (see WEBKIT_DATA_DIR / above)
# plus the user content manager, rather than the
# new_with_user_content_manager() convenience constructor, which
# would silently fall back to WebKit's default (prgname-based) context.
webview = WebKit2.WebView(web_context=web_context, user_content_manager=manager)
webview.set_settings(ws)
webview.load_uri(html_uri)
webview.set_background_color(Gdk.RGBA(0, 0, 0, 0))

# ── GTK window ────────────────────────────────────────────────────
win = Gtk.Window()
win.set_title("CC Monitor")
win.set_default_size(390, 650)
pos = load_window_pos()
win.move(pos["x"], pos["y"])
win.set_decorated(False)
win.set_resizable(True)
win.set_app_paintable(True)
win.set_visual(win.get_screen().get_rgba_visual())
win.connect("destroy", Gtk.main_quit)
win.connect("configure-event", lambda *args: save_window_pos() or False)
win.add(webview)
win.show_all()

GLib.timeout_add(2000, push_stats)
Gtk.main()
