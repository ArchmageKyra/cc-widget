#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  CC Widget installer
#
#  Copies the app into a standard per-user location, wires up a
#  desktop entry (+ optional autostart), and installs the icon.
#  Safe to run from anywhere — e.g. straight out of ~/Downloads —
#  since every path is resolved from this script's own location.
#
#  Expected layout (next to this script):
#    install.sh
#    uninstall.sh
#    app/launch.py         + the rest of the app
#    app/icon.svg          (optional — see § 4 below)
#    app/version.txt       (optional)
#
#  Usage:  bash install.sh
# ════════════════════════════════════════════════════════════════
set -Eeuo pipefail

# ── Colours / helpers ─────────────────────────────────────────────
GRN="\033[0;32m"; YLW="\033[0;33m"; RED="\033[0;31m"; BLU="\033[0;34m"; DIM="\033[2m"; RST="\033[0m"
ok()   { echo -e "  ${GRN}✓${RST}  $*"; }
info() { echo -e "  ${YLW}→${RST}  $*"; }
err()  { echo -e "  ${RED}✗${RST}  $*"; }
head() { echo -e "\n${BLU}$*${RST}"; }
hr()   { echo -e "${DIM}────────────────────────────────────────────────${RST}"; }

# ── Locations ──────────────────────────────────────────────────────
# SCRIPT_DIR is resolved from the script itself, so this works
# whether it's run in place inside the repo or from a downloaded /
# extracted copy sitting in ~/Downloads.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/app"

INSTALL_DIR="$HOME/.local/share/cc-widget"
CONFIG_DIR="$HOME/.config/cc-widget"
CACHE_DIR="$HOME/.cache/cc-widget"

DESKTOP_DIR="$HOME/.local/share/applications"
AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$DESKTOP_DIR/cc-widget.desktop"

ICON_ROOT="$HOME/.local/share/icons/hicolor"
ICON_NAME="cc-widget"

VERSION="Unknown"
[[ -f "$SOURCE_DIR/version.txt" ]] && VERSION="$(<"$SOURCE_DIR/version.txt")"

echo
echo " ⬡  CC Widget Installer"
echo "    Version $VERSION"
hr

# ── 1. Sanity checks ─────────────────────────────────────────────
head "Checking source files..."

if [[ ! -f "$SOURCE_DIR/launch.py" ]]; then
    err "Couldn't find app/launch.py next to this script."
    err "Expected layout:"
    err "  $(basename "$SCRIPT_DIR")/"
    err "    install.sh"
    err "    uninstall.sh"
    err "    app/launch.py   (+ the rest of the app)"
    err "Run this script from the extracted cc-widget folder."
    exit 1
fi

if ! command -v apt-get &>/dev/null; then
    err "apt-get not found — this installer is for Debian/Ubuntu systems."
    err "Install these packages manually and re-run:"
    err "  python3-gi  gir1.2-webkit2-4.1  python3-psutil"
    exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
    err "Please run as your normal user, not root."
    err "sudo will be invoked automatically when needed."
    exit 1
fi

ok "Source files found ($SOURCE_DIR)."

# ── 2. System packages ────────────────────────────────────────────
head "Checking system dependencies..."

PKGS=()
dpkg -s python3-gi           &>/dev/null || PKGS+=(python3-gi)
dpkg -s gir1.2-webkit2-4.1   &>/dev/null || PKGS+=(gir1.2-webkit2-4.1)
dpkg -s python3-psutil       &>/dev/null || PKGS+=(python3-psutil)

if [[ ${#PKGS[@]} -eq 0 ]]; then
    ok "All dependencies already installed."
else
    info "Installing: ${PKGS[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y "${PKGS[@]}"
    ok "Dependencies installed."
fi

# ── 3. Copy app into place ─────────────────────────────────────────
head "Installing CC Widget to $INSTALL_DIR..."

# If upgrading over a previous install, clear it out first so files
# removed in a newer version don't linger from the old one. User
# state (window position, config) lives outside INSTALL_DIR, so this
# is safe — see launch.py's CONFIG_DIR handling.
if [[ -d "$INSTALL_DIR" ]]; then
    info "Existing install found — replacing it."
    rm -rf "$INSTALL_DIR"
fi
mkdir -p "$INSTALL_DIR"
cp -r "$SOURCE_DIR"/. "$INSTALL_DIR"/
chmod +x "$INSTALL_DIR/launch.py"
ok "App files copied."

mkdir -p "$CONFIG_DIR" "$CACHE_DIR"
ok "Config/cache directories ready."

# ── 4. Icon ─────────────────────────────────────────────────────────
head "Installing icon..."

# Drop an icon.svg (preferred — scalable) or icon.png (256×256) into
# app/ and it'll be picked up automatically. Either "icon.*" or
# "cc-widget.*" is recognised, so you don't have to rename anything
# you've already got.
ICON_INSTALLED=""
SVG_CANDIDATE="$(find "$SOURCE_DIR" -maxdepth 2 \( -iname "icon.svg" -o -iname "cc-widget.svg" \) -print -quit 2>/dev/null || true)"
PNG_CANDIDATE="$(find "$SOURCE_DIR" -maxdepth 2 \( -iname "icon.png" -o -iname "cc-widget.png" \) -print -quit 2>/dev/null || true)"

if [[ -n "$SVG_CANDIDATE" ]]; then
    mkdir -p "$ICON_ROOT/scalable/apps"
    cp "$SVG_CANDIDATE" "$ICON_ROOT/scalable/apps/${ICON_NAME}.svg"
    ICON_INSTALLED="$ICON_NAME"
    ok "Installed scalable icon: $ICON_ROOT/scalable/apps/${ICON_NAME}.svg"
fi
if [[ -n "$PNG_CANDIDATE" ]]; then
    mkdir -p "$ICON_ROOT/256x256/apps"
    cp "$PNG_CANDIDATE" "$ICON_ROOT/256x256/apps/${ICON_NAME}.png"
    ICON_INSTALLED="$ICON_NAME"
    ok "Installed 256×256 icon: $ICON_ROOT/256x256/apps/${ICON_NAME}.png"
fi

if [[ -z "$ICON_INSTALLED" ]]; then
    info "No icon.svg / icon.png found in app/ — falling back to a stock icon."
    info "Drop your icon into app/ and re-run this script to use it instead."
    ICON_INSTALLED="utilities-system-monitor"
else
    gtk-update-icon-cache "$ICON_ROOT" &>/dev/null || true
fi

# ── 5. Desktop entry ─────────────────────────────────────────────
head "Creating desktop entry..."

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=CC Widget
Comment=Hardware monitor widget
Exec=python3 "$INSTALL_DIR/launch.py"
Icon=$ICON_INSTALLED
Type=Application
Categories=System;Monitor;
StartupNotify=false
EOF
chmod +x "$DESKTOP_FILE"
update-desktop-database "$DESKTOP_DIR" &>/dev/null || true
ok "Desktop entry created: $DESKTOP_FILE"

# ── 6. Autostart (optional) ──────────────────────────────────────
head "Autostart"
read -rp "  Launch CC Widget automatically at login? [y/N] " AUTOSTART
if [[ "${AUTOSTART,,}" == "y" ]]; then
    mkdir -p "$AUTOSTART_DIR"
    cp "$DESKTOP_FILE" "$AUTOSTART_DIR/cc-widget.desktop"
    ok "Autostart entry created: $AUTOSTART_DIR/cc-widget.desktop"
else
    info "Skipped autostart — launch anytime from your app launcher or with:"
    echo "       python3 $INSTALL_DIR/launch.py"
fi

# ── Done ─────────────────────────────────────────────────────────
hr
echo
ok "Installation complete."
echo
echo -e "  ${DIM}App files:${RST}     $INSTALL_DIR"
echo -e "  ${DIM}Config/state:${RST}  $CONFIG_DIR"
echo -e "  ${DIM}Run now:${RST}       python3 $INSTALL_DIR/launch.py"
echo
