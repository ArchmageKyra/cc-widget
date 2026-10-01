#!/usr/bin/env python3
"""CC Widget launcher.

Creates the borderless GTK/WebKit window, handles window positioning and
the JavaScript bridge, and pushes Linux system statistics into monitor.html.
"""

import json
import os
import subprocess
import threading
import time
import gi


# ============================================================================
# Environment / GTK backend
# ============================================================================

# Native Wayland can't place a window at saved screen coordinates, so run GTK
# through XWayland for X11-style move()/position. Only GTK's backend changes.
if os.environ.get("XDG_SESSION_TYPE") == "wayland":
    os.environ.setdefault("GDK_BACKEND", "x11")
    if os.environ["GDK_BACKEND"] == "x11":
        print("Wayland session detected — routing through XWayland so window position saving works.")

# ============================================================================
# GTK / WebKit imports
# ============================================================================

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("WebKit2", "4.1")

from gi.repository import Gdk, GLib, Gtk, WebKit2


# ============================================================================
# Optional dependencies
# ============================================================================

try:
    import psutil

    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    print("Warning: python3-psutil not found — system stats disabled.")
    print("  Fix: sudo apt install python3-psutil")


# ============================================================================
# Paths and persistent application data
# ============================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
HTML_URI = "file://" + os.path.join(HERE, "monitor.html")

# XDG Base Directory layout rather than state beside the executable.
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


WINDOW_POS_FILE = os.path.join(CONFIG_DIR, "window_pos.json")

# Keep WebKit's website data and cache under our own directories.
WEBKIT_DATA_DIR = os.path.join(CONFIG_DIR, "webkit-data")
WEBKIT_CACHE_DIR = os.path.join(CACHE_DIR, "webkit-cache")

os.makedirs(WEBKIT_DATA_DIR, exist_ok=True)
os.makedirs(WEBKIT_CACHE_DIR, exist_ok=True)


# ============================================================================
# Window configuration
# ============================================================================

# The window starts small while WebKit loads; the frontend then requests its real size.
BOOT_W, BOOT_H = 320, 300

MIN_W, MAX_W = 300, 1200
MIN_H, MAX_H = 200, 1400

ANCHOR_CORNERS = {
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
}

# Current anchor corner; None = a normal free-positioned window.
_anchor_corner = None


def get_anchor_position(
    corner: str,
    x: int,
    y: int,
    width: int,
    height: int,
) -> tuple[int, int]:
    """Return the screen coordinate of a window's selected anchor point."""

    if corner == "top-right":
        return x + width, y

    if corner == "bottom-left":
        return x, y + height

    if corner == "bottom-right":
        return x + width, y + height

    # top-left
    return x, y


def position_from_anchor(
    corner: str,
    anchor_x: int,
    anchor_y: int,
    width: int,
    height: int,
) -> tuple[int, int]:
    """Calculate the window's top-left position from an anchor point."""

    if corner == "top-right":
        return anchor_x - width, anchor_y

    if corner == "bottom-left":
        return anchor_x, anchor_y - height

    if corner == "bottom-right":
        return anchor_x - width, anchor_y - height

    # top-left
    return anchor_x, anchor_y

def _apply_geometry(width, height, x, y):
    """Move and resize in a single X11 request, avoiding the grow-then-jump
    flash separate resize()/move() calls cause.

    That alone doesn't stop the compositor painting a frame mid-resize,
    before WebKit has repainted at the new size, so updates are frozen
    until it has.
    """
    win.set_size_request(-1, -1)
    gdk_window = win.get_window()
    if gdk_window is not None:
        gdk_window.freeze_updates()
        gdk_window.move_resize(x, y, width, height)
        # Thaw on the next idle pass so WebKit can repaint at the new size first.
        GLib.idle_add(gdk_window.thaw_updates)
    else:
        # Not realized yet (shouldn't happen after show_all()).
        win.resize(width, height)
        win.move(x, y)


def _schedule_geometry(width, height, x, y) -> None:
    """Apply a geometry change on the next GLib idle pass."""

    def apply():
        _apply_geometry(width, height, x, y)
        return False

    GLib.idle_add(apply)


def _eval_js(javascript: str) -> None:
    """Run JavaScript in the webview, if it exists yet."""

    if webview is not None:
        webview.evaluate_javascript(javascript, -1, None, None)


# Name the process so desktop tools don't show "launch.py".
GLib.set_prgname("cc-widget")
GLib.set_application_name("CC Widget")


# ============================================================================
# WebKit configuration
# ============================================================================

webkit_settings = WebKit2.Settings()
webkit_settings.set_allow_universal_access_from_file_urls(True)
webkit_settings.set_allow_file_access_from_file_urls(True)
webkit_settings.set_javascript_can_open_windows_automatically(False)

# Explicit context so WebKit's data/cache locations are predictable.
webkit_data_manager = WebKit2.WebsiteDataManager(
    base_data_directory=WEBKIT_DATA_DIR,
    base_cache_directory=WEBKIT_CACHE_DIR,
)

web_context = WebKit2.WebContext.new_with_website_data_manager(
    webkit_data_manager
)


# ============================================================================
# Network rate tracking
# ============================================================================

# psutil's byte counters are cumulative, so rates are deltas between samples.
_previous_net = None
_previous_net_time = None


def get_net_rates() -> dict[str, float]:
    """Return current receive/transmit rates in KB/s."""

    global _previous_net, _previous_net_time

    if not HAS_PSUTIL:
        return {"rx_kbps": 0.0, "tx_kbps": 0.0}
    now = time.monotonic()

    try:
        network = psutil.net_io_counters()
    except Exception:
        return {"rx_kbps": 0.0, "tx_kbps": 0.0}

    # The first sample has no previous measurement to compare against.
    if _previous_net is None:
        _previous_net = network
        _previous_net_time = now
        return {"rx_kbps": 0.0, "tx_kbps": 0.0}

    elapsed = max(now - _previous_net_time, 0.1)

    rx_kbps = (
        (network.bytes_recv - _previous_net.bytes_recv)
        / elapsed
        / 1024
    )

    tx_kbps = (
        (network.bytes_sent - _previous_net.bytes_sent)
        / elapsed
        / 1024
    )

    _previous_net = network
    _previous_net_time = now

    return {
        "rx_kbps": round(max(0.0, rx_kbps), 1),
        "tx_kbps": round(max(0.0, tx_kbps), 1),
    }


# ============================================================================
# Folder size tracking
# ============================================================================

# `du` walks the filesystem, so results are cached and computed in background
# threads to keep the UI from blocking.
_folder_paths: list[str] = []
_folder_sizes: dict[str, float] = {}
_folder_sizes_lock = threading.Lock()


def compute_folder_size(path: str) -> None:
    """Calculate one folder's size and update the shared cache."""

    try:
        result = subprocess.run(
            ["du", "-sb", "--", path],
            capture_output=True,
            text=True,
            timeout=15,
        )

        if result.returncode != 0:
            return

        bytes_value = int(result.stdout.split()[0])
        size_gb = round(bytes_value / 1024**3, 3)

        with _folder_sizes_lock:
            _folder_sizes[path] = size_gb

    except Exception:
        pass


def refresh_folder_sizes() -> None:
    """Start background refreshes for all currently watched folders."""

    for path in list(_folder_paths):
        thread = threading.Thread(
            target=compute_folder_size,
            args=(path,),
            daemon=True,
        )
        thread.start()


# ============================================================================
# GTK / WebKit application state
# ============================================================================

manager = WebKit2.UserContentManager()

win = None
webview = None

# (width, height) requested by the latest "boot"/"resize:" message, cleared
# once the window really reaches it. on_window_configure() uses it to tell JS
# when the resize has landed, since a configure-event can also fire for an
# intermediate geometry (common under XWayland).
_resize_target = None

# ============================================================================
# JavaScript → Python message handling
# ============================================================================

def on_message(_manager, result) -> None:
    """Handle commands sent from monitor.html."""

    global _folder_paths, _anchor_corner, _resize_target

    try:
        message = result.get_js_value().to_string()
    except Exception as exc:
        print("Message error:", exc)
        return

    # ------------------------------------------------------------------------
    # Window controls
    # ------------------------------------------------------------------------

    if message == "close":
        Gtk.main_quit()
        return

    if message == "pin":
        win.set_keep_above(True)
        return

    if message == "unpin":
        win.set_keep_above(False)
        return

    # ------------------------------------------------------------------------
    # Initial boot resize
    # ------------------------------------------------------------------------

    if message == "boot":
        try:
            width, height = BOOT_W, BOOT_H

            if _anchor_corner in ANCHOR_CORNERS:
                x, y = position_from_anchor(
                    _anchor_corner,
                    saved_position["x"],
                    saved_position["y"],
                    width,
                    height,
                )
            else:
                x, y = saved_position["x"], saved_position["y"]

            _resize_target = (width, height)
            _schedule_geometry(width, height, x, y)

        except Exception as exc:
            print("Boot resize error:", exc)

        return

    # ------------------------------------------------------------------------
    # Dynamic resize
    # ------------------------------------------------------------------------

    if message.startswith("resize:"):
        try:
            parts = message.split(":")

            if len(parts) == 3:
                width = int(parts[1])
                height = int(parts[2])
            else:
                width = win.get_size()[0]
                height = int(parts[1])

            width = max(MIN_W, min(width, MAX_W))
            height = max(MIN_H, min(height, MAX_H))

            x, y = win.get_position()
            old_width, old_height = win.get_size()

            if _anchor_corner in ANCHOR_CORNERS:
                # Keep the anchor corner fixed on screen while the size changes.
                anchor_x, anchor_y = get_anchor_position(
                    _anchor_corner,
                    x,
                    y,
                    old_width,
                    old_height,
                )

                new_x, new_y = position_from_anchor(
                    _anchor_corner,
                    anchor_x,
                    anchor_y,
                    width,
                    height,
                )
            else:
                new_x, new_y = x, y

            _resize_target = (width, height)
            _schedule_geometry(width, height, new_x, new_y)

        except Exception as exc:
            print("Resize error:", exc)

        return

    # ------------------------------------------------------------------------
    # Anchor selection
    # ------------------------------------------------------------------------

    if message.startswith("anchor:"):
        corner = message.split(":", 1)[1].strip()

        if corner not in ANCHOR_CORNERS:
            return

        try:
            x, y = win.get_position()
            width, height = win.get_size()

            # Store the anchor point, not the top-left, so resizing keeps the corner fixed.
            anchor_x, anchor_y = get_anchor_position(
                corner,
                x,
                y,
                width,
                height,
            )

            _anchor_corner = corner

            _write_window_position(anchor_x, anchor_y, corner)

        except Exception as exc:
            print("Anchor error:", exc)

        return

    # ------------------------------------------------------------------------
    # Folder picker
    # ------------------------------------------------------------------------

    if message == "pick-folder":
        path = _choose_folder_path()
        if not path:
            return

        _eval_js(f"if(window.onFolderPicked)window.onFolderPicked({json.dumps(path)})")
        return

    # ------------------------------------------------------------------------
    # Settings export / import
    #
    # JS owns the "ccm" config (localStorage); Python owns window_pos.json.
    # Export bundles both into one file. Import restores the window position,
    # repositions the live window, then hands ccm back to JS to store and reload.
    # ------------------------------------------------------------------------

    if message.startswith("export-settings:"):
        try:
            ccm = json.loads(message.split(":", 1)[1])
        except Exception as exc:
            print("Export parse error:", exc)
            return

        path = _choose_export_path()
        if not path:
            return

        bundle = {
            "export_version": 1,
            "ccm": ccm,
            "window_pos": load_window_position(),
        }

        try:
            _atomic_write_json(path, bundle, indent=2)
        except Exception as exc:
            print("Export write error:", exc)
            _js_alert("Couldn't save the settings file — see the terminal for details.")

        return

    if message == "import-settings":
        path = _choose_import_path()
        if not path:
            return

        try:
            with open(path, "r") as file:
                bundle = json.load(file)
        except Exception as exc:
            print("Import read error:", exc)
            _js_alert("Couldn't read that file.")
            return

        if not isinstance(bundle, dict) or "ccm" not in bundle:
            _js_alert("That doesn't look like a cc-widget settings file.")
            return

        win_pos = bundle.get("window_pos")
        if isinstance(win_pos, dict):
            x = win_pos.get("x", 1500)
            y = win_pos.get("y", 50)
            corner = win_pos.get("corner")
            if corner not in ANCHOR_CORNERS:
                corner = None

            _write_window_position(x, y, corner)
            _anchor_corner = corner

            try:
                width, height = win.get_size()

                if corner:
                    new_x, new_y = position_from_anchor(corner, x, y, width, height)
                else:
                    new_x, new_y = x, y

                _schedule_geometry(width, height, new_x, new_y)

            except Exception as exc:
                print("Import reposition error:", exc)

        _eval_js(
            "if(window.onSettingsImported)"
            f"window.onSettingsImported({json.dumps(bundle['ccm'])})"
        )
        return

    # ------------------------------------------------------------------------
    # Watched folders
    # ------------------------------------------------------------------------

    if message.startswith("watch:"):
        try:
            # JS sends the complete list whenever it changes.
            new_paths = json.loads(message[6:])

            with _folder_sizes_lock:
                # Drop cache entries for folders no longer watched.
                for path in list(_folder_sizes):
                    if path not in new_paths:
                        del _folder_sizes[path]

            _folder_paths = new_paths

            # Refresh immediately rather than waiting for the next stats tick.
            refresh_folder_sizes()

        except Exception as exc:
            print("Watch parse error:", exc)

        return

    # ------------------------------------------------------------------------
    # Borderless window dragging
    # ------------------------------------------------------------------------

    if message.startswith("dragstart"):
        try:
            pointer_x, pointer_y = win.get_pointer()[1:3]

            win.begin_move_drag(
                1,
                pointer_x,
                pointer_y,
                Gtk.get_current_event_time(),
            )
        except Exception:
            # A drag request can legitimately race with window state changes.
            pass


manager.connect("script-message-received::ccm", on_message)
manager.register_script_message_handler("ccm")


# ============================================================================
# Filesystem filtering
# ============================================================================

# Pseudo-filesystems that aren't user-facing storage (this keeps Snap images
# and virtual filesystems out of the storage card).
SKIP_FILESYSTEMS = {
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


# ============================================================================
# System statistics → JavaScript
# ============================================================================

def push_stats() -> bool:
    """Collect system statistics and push them to the frontend.

    Returns True so GLib keeps calling it every 2 seconds.
    """

    if webview is None:
        return True

    if not HAS_PSUTIL:
        _eval_js("if(window.onLinuxStats)window.onLinuxStats({unavailable:true})")
        return True

    try:
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        cpu_frequency = psutil.cpu_freq()
        network = get_net_rates()

        # --------------------------------------------------------------------
        # Mounted disks
        # --------------------------------------------------------------------

        disks = {}

        for partition in psutil.disk_partitions(all=False):
            if (
                not partition.fstype
                or partition.fstype in SKIP_FILESYSTEMS
            ):
                continue

            # Loop and RAM devices aren't useful physical storage entries.
            if partition.device.startswith(("/dev/loop", "/dev/ram")):
                continue

            try:
                usage = psutil.disk_usage(partition.mountpoint)

                disks[partition.mountpoint] = {
                    "device": partition.device,
                    "percent": round(usage.percent, 1),
                    "used_gb": round(usage.used / 1024**3, 1),
                    "free_gb": round(usage.free / 1024**3, 1),
                    "total_gb": round(usage.total / 1024**3, 1),
                }

            except (PermissionError, OSError):
                # A mount can vanish between disk_partitions() and disk_usage().
                pass

        # --------------------------------------------------------------------
        # Watched folder sizes
        # --------------------------------------------------------------------

        # Send the cached sizes now and start a background refresh for next time.
        with _folder_sizes_lock:
            folder_sizes = dict(_folder_sizes)
        refresh_folder_sizes()

        # --------------------------------------------------------------------
        # Build the payload consumed by monitor.html
        # --------------------------------------------------------------------

        stats = {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "cpu_freq_ghz": (
                round(cpu_frequency.current / 1000, 2)
                if cpu_frequency
                else None
            ),
            "cpu_freq_max": (
                round(cpu_frequency.max / 1000, 2)
                if cpu_frequency and cpu_frequency.max
                else None
            ),
            "ram_percent": memory.percent,
            "ram_used_gb": round(memory.used / 1024**3, 2),
            "ram_free_gb": round(memory.available / 1024**3, 2),
            "ram_total_gb": round(memory.total / 1024**3, 2),
            "swap_percent": swap.percent,
            "swap_used_gb": round(swap.used / 1024**3, 2),
            "swap_total_gb": round(swap.total / 1024**3, 2),
            "disks": disks,
            "net": network,
            "folder_sizes": folder_sizes,
        }

    except Exception as exc:
        stats = {
            "error": str(exc),
        }

    _eval_js(f"if(window.onLinuxStats)window.onLinuxStats({json.dumps(stats)})")
    return True


# ============================================================================
# Window position persistence
# ============================================================================

def _atomic_write_json(path: str, data, **dump_kwargs) -> None:
    """Write JSON to a temp file, then rename it into place.

    os.replace() is atomic on POSIX, so a crash mid-write leaves the old file
    or the new one, never a truncated one.
    """

    tmp_path = path + ".tmp"

    with open(tmp_path, "w") as file:
        json.dump(data, file, **dump_kwargs)

    os.replace(tmp_path, path)


def _write_window_position(x: int, y: int, corner) -> None:
    """Persist the window position/anchor file."""

    _atomic_write_json(WINDOW_POS_FILE, {"x": x, "y": y, "corner": corner})


def _run_file_dialog(
    title: str,
    action,
    accept_label: str,
    *,
    json_only: bool = False,
    current_name: str = None,
):
    """Run a native file chooser; return the chosen path, or None if cancelled."""

    dialog = Gtk.FileChooserDialog(title=title, parent=win, action=action)
    dialog.add_buttons(
        "_Cancel",
        Gtk.ResponseType.CANCEL,
        accept_label,
        Gtk.ResponseType.OK,
    )

    if current_name:
        dialog.set_current_name(current_name)
        dialog.set_do_overwrite_confirmation(True)

    if json_only:
        json_filter = Gtk.FileFilter()
        json_filter.set_name("JSON files")
        json_filter.add_pattern("*.json")
        dialog.add_filter(json_filter)

    path = None
    if dialog.run() == Gtk.ResponseType.OK:
        path = dialog.get_filename()

    dialog.destroy()
    return path


def _choose_export_path() -> str:
    """'Save As' dialog for exporting settings. Returns a .json path or None."""

    path = _run_file_dialog(
        "Export Settings",
        Gtk.FileChooserAction.SAVE,
        "_Save",
        json_only=True,
        current_name="cc-widget-settings.json",
    )
    if path and not path.endswith(".json"):
        path += ".json"
    return path


def _choose_import_path() -> str:
    """'Open' dialog for importing settings. Returns a path or None."""

    return _run_file_dialog(
        "Import Settings",
        Gtk.FileChooserAction.OPEN,
        "_Open",
        json_only=True,
    )


def _choose_folder_path() -> str:
    """'Select folder' dialog for the folder-size feature. Returns an existing
    directory, or None if cancelled."""

    return _run_file_dialog(
        "Select Folder to Monitor",
        Gtk.FileChooserAction.SELECT_FOLDER,
        "_Select",
    )


def _js_alert(text: str) -> None:
    """Show a message via the frontend's alert()."""

    _eval_js(f"alert({json.dumps(text)})")


def load_window_position() -> dict:
    """Load the last saved window position and anchor configuration."""

    try:
        with open(WINDOW_POS_FILE, "r") as file:
            data = json.load(file)

        return {
            "x": data.get("x", 1500),
            "y": data.get("y", 50),
            "corner": data.get("corner"),
        }

    except Exception:
        return {
            "x": 1500,
            "y": 50,
            "corner": None,
        }


def save_window_position() -> None:
    """Save the window position (the anchor point, for anchored windows, so it
    stays valid when the size changes)."""

    if win is None:
        return

    try:
        x, y = win.get_position()
        width, height = win.get_size()

        if _anchor_corner in ANCHOR_CORNERS:
            save_x, save_y = get_anchor_position(
                _anchor_corner,
                x,
                y,
                width,
                height,
            )
        else:
            save_x, save_y = x, y

        _write_window_position(save_x, save_y, _anchor_corner)

    except Exception:
        # Can race with window destruction/configuration.
        pass


# ============================================================================
# WebKit view
# ============================================================================

# Must use the explicit context above; the convenience constructor would
# create a default one and scatter WebKit data.
webview = WebKit2.WebView(
    web_context=web_context,
    user_content_manager=manager,
)

webview.set_settings(webkit_settings)
webview.load_uri(HTML_URI)

# The HTML provides the background.
webview.set_background_color(
    Gdk.RGBA(0, 0, 0, 0)
)


# ============================================================================
# GTK window
# ============================================================================

win = Gtk.Window()
win.set_title("CC Monitor")

# Restore the saved position before showing the window.
saved_position = load_window_position()
_anchor_corner = saved_position.get("corner")

# Start small while the WebKit page initializes.
win.set_default_size(BOOT_W, BOOT_H)

if _anchor_corner in ANCHOR_CORNERS:
    initial_x, initial_y = position_from_anchor(
        _anchor_corner,
        saved_position["x"],
        saved_position["y"],
        BOOT_W,
        BOOT_H,
    )
else:
    _anchor_corner = None
    initial_x = saved_position["x"]
    initial_y = saved_position["y"]

win.move(initial_x, initial_y)

# Borderless, transparent shell around the WebKit UI.
win.set_decorated(False)
win.set_resizable(True)
win.set_app_paintable(True)
win.set_visual(win.get_screen().get_rgba_visual())

# GTK themes draw a rectangular drop shadow on RGBA top-level windows (via the
# ".background" node), which pokes out past our CSS --r rounded corners.
# Strip it so our CSS alone defines the window's shape.
_shadow_css = Gtk.CssProvider()
_shadow_css.load_from_data(b"""
window.background {
    background-color: transparent;
    box-shadow: none;
    border-style: none;
    margin: 0;
}
""")
Gtk.StyleContext.add_provider_for_screen(
    win.get_screen(),
    _shadow_css,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
)

win.connect("destroy", Gtk.main_quit)

def on_window_configure(_window, _event) -> bool:
    """Save the window position on settled geometry changes, and tell the
    frontend once a pending resize has reached its target size.

    configure-event can fire several times for one move_resize() (WM/XWayland
    settling), so acting on the first is unsafe. An anchored window's saved
    position is computed from its current size, so saving mid-transition bakes
    in a wrong anchor; boot resizes at least twice, which is how a "drifts a
    little further each launch" bug appears. Gating the save on the same
    target check as the ack avoids both.
    """

    global _resize_target

    width, height = win.get_size()
    settled = _resize_target is None or (
        abs(width - _resize_target[0]) <= 1 and abs(height - _resize_target[1]) <= 1
    )
    if settled:
        save_window_position()

    if _resize_target is not None and webview is not None:
        target_w, target_h = _resize_target
        if abs(width - target_w) <= 1 and abs(height - target_h) <= 1:
            _resize_target = None
            _eval_js(
                f"window.__onResizeApplied && window.__onResizeApplied({width},{height})"
            )

    return False

win.connect("configure-event", on_window_configure)

win.add(webview)
win.show_all()


# ============================================================================
# Main loop
# ============================================================================

# Push system statistics every 2 seconds.
GLib.timeout_add(2000, push_stats)

Gtk.main()
