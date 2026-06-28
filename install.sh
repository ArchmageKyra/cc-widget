#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  CC Widget installer
#  Sets up system dependencies, makes the launcher executable,
#  and wires up a desktop entry + optional autostart.
#
#  Usage:  bash install.sh
# ════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────
GRN="\033[0;32m"; YLW="\033[0;33m"; RED="\033[0;31m"; DIM="\033[2m"; RST="\033[0m"
ok()   { echo -e "  ${GRN}✓${RST}  $*"; }
info() { echo -e "  ${YLW}→${RST}  $*"; }
err()  { echo -e "  ${RED}✗${RST}  $*"; }
hr()   { echo -e "${DIM}────────────────────────────────────────────────${RST}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH="$SCRIPT_DIR/launch.py"

echo ""
echo -e "  ⬡  CoolerControl Widget — installer"
hr

# ── 1. Sanity checks ─────────────────────────────────────────────
if [[ ! -f "$LAUNCH" ]]; then
    err "launch.py not found in $SCRIPT_DIR"
    err "Run this script from the cc-widget project directory."
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

# ── 2. System packages ────────────────────────────────────────────
hr
echo -e "  Checking system dependencies…"

PKGS=()
dpkg -s python3-gi            &>/dev/null || PKGS+=(python3-gi)
dpkg -s gir1.2-webkit2-4.1   &>/dev/null || PKGS+=(gir1.2-webkit2-4.1)
dpkg -s python3-psutil        &>/dev/null || PKGS+=(python3-psutil)

if [[ ${#PKGS[@]} -eq 0 ]]; then
    ok "All dependencies already installed."
else
    info "Installing: ${PKGS[*]}"
    sudo apt-get install -y "${PKGS[@]}"
    ok "Dependencies installed."
fi

# ── 3. Make launcher executable ──────────────────────────────────
hr
chmod +x "$LAUNCH"
ok "launch.py is executable."

# ── 4. Desktop entry ─────────────────────────────────────────────
hr
echo -e "  Creating desktop entry…"

APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

ICON="utilities-system-monitor"   # standard freedesktop icon; swap path if you have a custom one

cat > "$APPS_DIR/cc-widget.desktop" << EOF
[Desktop Entry]
Name=CC Widget
Comment=Hardware monitor widget
Exec=$LAUNCH
Icon=$ICON
Type=Application
Categories=System;Monitor;
StartupNotify=false
EOF

chmod +x "$APPS_DIR/cc-widget.desktop"
update-desktop-database "$APPS_DIR" 2>/dev/null || true
ok "Desktop entry created: $APPS_DIR/cc-widget.desktop"

# ── 5. Autostart (optional) ──────────────────────────────────────
hr
read -rp "  Launch CC Widget automatically at login? [y/N] " AUTOSTART
if [[ "${AUTOSTART,,}" == "y" ]]; then
    AUTOSTART_DIR="$HOME/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    cp "$APPS_DIR/cc-widget.desktop" "$AUTOSTART_DIR/cc-widget.desktop"
    ok "Autostart entry created: $AUTOSTART_DIR/cc-widget.desktop"
else
    info "Skipped autostart — you can run CC Widget from your app launcher or with:"
    echo  "       python3 $LAUNCH"
fi

# ── Done ─────────────────────────────────────────────────────────
hr
echo ""
ok "Installation complete."
echo ""
echo -e "  ${DIM}Run now:${RST}  python3 $LAUNCH"
echo ""
