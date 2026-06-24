#!/usr/bin/env python3
"""
CC Monitor launcher — borderless GTK/WebKit desktop widget.

Run:    python3 launch.py
Drag:   click and drag the title bar
Close:  × button, or Alt+F4
Pin:    📌 button

Deps:   sudo apt install python3-gi gir1.2-webkit2-4.1 python3-psutil
"""

import json
import os
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
WINDOW_POS_FILE = os.path.join(here, "window_pos.json")
html_uri = "file://" + os.path.join(here, "monitor.html")

# ── WebKit settings ───────────────────────────────────────────────
ws = WebKit2.Settings()
ws.set_allow_universal_access_from_file_urls(True)
ws.set_allow_file_access_from_file_urls(True)
ws.set_javascript_can_open_windows_automatically(False)

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


# ── Message handler (JS → Python) ────────────────────────────────
manager = WebKit2.UserContentManager()
win = None
webview = None


def on_message(mgr, result):
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
                # New format: resize:W:H
                w = int(parts[1])
                h = int(parts[2])
            else:
                # Legacy format: resize:H  (keep width unchanged)
                w = win.get_size()[0]
                h = int(parts[1])
            w = max(300, min(w, 1200))
            h = max(200, min(h, 1400))
            GLib.idle_add(lambda w=w, h=h: win.resize(w, h) or False)
        except Exception as e:
            print("Resize error:", e)


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

        # Real disk partitions only
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

        stats = {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "cpu_freq_ghz": round(cpu_freq.current / 1000, 2) if cpu_freq else None,
            "cpu_freq_max": round(cpu_freq.max / 1000, 2)
            if cpu_freq and cpu_freq.max
            else None,
            "ram_percent": vm.percent,
            "ram_used_gb": round(vm.used / 1024**3, 2),
            "ram_free_gb": round(vm.available / 1024**3, 2),  # available, not free
            "ram_total_gb": round(vm.total / 1024**3, 2),
            "swap_percent": swap.percent,
            "swap_used_gb": round(swap.used / 1024**3, 2),
            "swap_total_gb": round(swap.total / 1024**3, 2),
            "disks": disks,
            "net": net,
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
webview = WebKit2.WebView.new_with_user_content_manager(manager)
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
