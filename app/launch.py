#!/usr/bin/env python3
"""
CC Widget launcher.

Creates the borderless GTK/WebKit window, handles window positioning,
communicates with the JavaScript frontend, and periodically pushes
Linux system statistics into monitor.html.
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

# GTK's native Wayland positioning APIs are awkward for this widget because
# we intentionally save and restore the window's screen coordinates.
#
# Running GTK through XWayland gives us the traditional X11 move()/position
# behavior we need. This only changes the GTK backend; the rest of the desktop
# can remain on Wayland normally.
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

# Follow the XDG Base Directory specification instead of storing application
# state beside the executable.
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


# Window position is user state, so it belongs in ~/.config rather than the
# application directory.
WINDOW_POS_FILE = os.path.join(CONFIG_DIR, "window_pos.json")

# WebKit maintains its own website data and cache. Keeping those under our
# application directories prevents WebKit from scattering state elsewhere.
WEBKIT_DATA_DIR = os.path.join(CONFIG_DIR, "webkit-data")
WEBKIT_CACHE_DIR = os.path.join(CACHE_DIR, "webkit-cache")

os.makedirs(WEBKIT_DATA_DIR, exist_ok=True)
os.makedirs(WEBKIT_CACHE_DIR, exist_ok=True)


# ============================================================================
# Window configuration
# ============================================================================

# The window starts small while WebKit loads, then the frontend can request
# its normal size once it is ready.
BOOT_W, BOOT_H = 320, 300

MIN_W, MAX_W = 300, 1200
MIN_H, MAX_H = 200, 1400

ANCHOR_CORNERS = {
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
}

# Current anchor mode. None means the window behaves like a normal
# free-positioned window.
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
    """Move and resize in a single X11 request to avoid the visible
    grow-then-jump flash that separate resize()/move() calls cause.

    move_resize() being one request stops GTK from painting an
    intermediate frame between the move and the resize, but it doesn't
    stop X11/the compositor from painting a frame *during* the resize
    itself, before WebKit has repainted its content at the new size —
    that's the actual source of the flash on every resize, not just the
    boot reveal. freeze_updates()/thaw_updates() suppresses painting for
    that window in between, so the compositor only ever shows a
    fully-settled frame.
    """
    win.set_size_request(-1, -1)
    gdk_window = win.get_window()
    if gdk_window is not None:
        gdk_window.freeze_updates()
        gdk_window.move_resize(x, y, width, height)
        # Thaw on the next idle pass rather than immediately — gives
        # WebKit a chance to reflow/repaint at the new size first, so the
        # first frame the compositor is allowed to show is already correct.
        GLib.idle_add(gdk_window.thaw_updates)
    else:
        # Not realized yet (shouldn't happen once win.show_all() has run,
        # but fall back just in case).
        win.resize(width, height)
        win.move(x, y)

# Give the process a meaningful application name instead of inheriting
# "launch.py". This also helps desktop tools identify the application.
GLib.set_prgname("cc-widget")
GLib.set_application_name("CC Widget")


# ============================================================================
# WebKit configuration
# ============================================================================

webkit_settings = WebKit2.Settings()
webkit_settings.set_allow_universal_access_from_file_urls(True)
webkit_settings.set_allow_file_access_from_file_urls(True)
webkit_settings.set_javascript_can_open_windows_automatically(False)

# Use an explicit WebKit context so its data/cache locations are predictable.
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

# psutil gives us cumulative byte counters, so network speed must be
# calculated as a delta between successive samples.
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

# Folder sizes can be expensive to calculate because they require walking
# the filesystem. Keep the results cached and perform "du" in background
# threads so the GTK/WebKit UI never blocks while calculating them.
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

# Set right before a "boot"/"resize:" message triggers _apply_geometry, to
# (width, height) — cleared once win.get_size() actually reaches it. Lets
# on_window_configure() tell JS the instant the native window has genuinely
# reached its target size, rather than acking on the first configure-event
# of any kind, which can fire on an intermediate/spurious geometry change
# (common enough under XWayland) before the real resize has landed.
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

    if message == "minimize":
        win.iconify()
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

            def boot_window(width=width, height=height, x=x, y=y):
                _apply_geometry(width, height, x, y)
                return False

            GLib.idle_add(boot_window)

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
                # Preserve the fixed screen-space anchor while changing the
                # window dimensions. Without this, resizing from the opposite
                # side would make an anchored window appear to "drift".
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

            def resize_window(width=width, height=height, x=new_x, y=new_y):
                _apply_geometry(width, height, x, y)
                return False

            GLib.idle_add(resize_window)

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

            # Store the anchor's screen coordinate rather than the window's
            # top-left coordinate. This allows the window to change size while
            # keeping the selected corner fixed in place.
            anchor_x, anchor_y = get_anchor_position(
                corner,
                x,
                y,
                width,
                height,
            )

            _anchor_corner = corner

            with open(WINDOW_POS_FILE, "w") as file:
                json.dump(
                    {
                        "x": anchor_x,
                        "y": anchor_y,
                        "corner": corner,
                    },
                    file,
                )

        except Exception as exc:
            print("Anchor error:", exc)

        return

    # ------------------------------------------------------------------------
    # Watched folders
    # ------------------------------------------------------------------------

    if message.startswith("watch:"):
        try:
            # JavaScript sends the complete list whenever its watched-folder
            # configuration changes.
            new_paths = json.loads(message[6:])

            with _folder_sizes_lock:
                # Remove cached entries for folders that are no longer watched.
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

# These pseudo-filesystems aren't useful as user-facing storage devices.
# In particular, excluding loop/squashfs/overlay mounts prevents things like
# Snap images and virtual filesystems from polluting the storage display.
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
    """
    Collect system statistics and push them into the WebKit frontend.

    Returns True so GLib keeps calling this function every 2 seconds.
    """

    if webview is None:
        return True

    if not HAS_PSUTIL:
        javascript = (
            "if(window.onLinuxStats)"
            "window.onLinuxStats({unavailable:true})"
        )

        webview.evaluate_javascript(
            javascript,
            -1,
            None,
            None,
        )

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
                # Some mounts can disappear or become inaccessible between
                # disk_partitions() and disk_usage().
                pass

        # --------------------------------------------------------------------
        # Watched folder sizes
        # --------------------------------------------------------------------

        # Copy the cache while holding the lock, then release it before doing
        # anything else. The expensive work happens in background threads.
        with _folder_sizes_lock:
            folder_sizes = dict(_folder_sizes)

        # Start another asynchronous refresh. The current cached values are
        # still sent to JavaScript immediately.
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

    javascript = (
        "if(window.onLinuxStats)"
        f"window.onLinuxStats({json.dumps(stats)})"
    )

    webview.evaluate_javascript(
        javascript,
        -1,
        None,
        None,
    )

    return True


# ============================================================================
# Window position persistence
# ============================================================================

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
        # These defaults are intentionally conservative. The frontend will
        # resize the window after WebKit finishes loading.
        return {
            "x": 1500,
            "y": 50,
            "corner": None,
        }


def save_window_position() -> None:
    """
    Save the current window position.

    For anchored windows we save the anchor coordinate instead of the
    top-left coordinate so the position remains valid when the window size
    changes.
    """

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

        with open(WINDOW_POS_FILE, "w") as file:
            json.dump(
                {
                    "x": save_x,
                    "y": save_y,
                    "corner": _anchor_corner,
                },
                file,
            )

    except Exception:
        # Window destruction/configuration can race with position saving.
        pass


# ============================================================================
# WebKit view
# ============================================================================

# Use the explicit WebKit context created above. Using the convenience
# constructor here would create a different/default context and could cause
# WebKit data to end up somewhere unexpected.
webview = WebKit2.WebView(
    web_context=web_context,
    user_content_manager=manager,
)

webview.set_settings(webkit_settings)
webview.load_uri(HTML_URI)

# Let the HTML document provide its own visual background.
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

win.connect("destroy", Gtk.main_quit)

# Save position whenever GTK reports a geometry change. This keeps the
# position persistent even if the application is closed normally after a
# resize or drag.
def on_window_configure(_window, _event) -> bool:
    """Persist the current window position whenever GTK reports a geometry
    change, and — if a resize/boot message is waiting on one — tell the
    frontend once the native window has genuinely reached its target size.

    configure-event can fire more than once for a single move_resize() call
    (WM/XWayland settling, intermediate frames, etc.), so acking on the
    first one to arrive isn't safe — it can report a size that hasn't
    actually landed yet. Comparing against the real target and only acking
    on a match is what makes this a trustworthy completion signal rather
    than just "something happened."
    """

    global _resize_target

    save_window_position()

    if _resize_target is not None and webview is not None:
        width, height = win.get_size()
        target_w, target_h = _resize_target
        if abs(width - target_w) <= 1 and abs(height - target_h) <= 1:
            _resize_target = None
            webview.evaluate_javascript(
                f"window.__onResizeApplied && window.__onResizeApplied({width},{height})",
                -1,
                None,
                None,
            )

    return False

win.connect("configure-event", on_window_configure)

win.add(webview)
win.show_all()


# ============================================================================
# Main loop
# ============================================================================

# Push system statistics to JavaScript every 2 seconds.
GLib.timeout_add(2000, push_stats)

Gtk.main()
