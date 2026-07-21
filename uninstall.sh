#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# CC Widget Uninstaller
# ════════════════════════════════════════════════════════════════

set -Eeuo pipefail

GRN="\033[0;32m"
YLW="\033[0;33m"
RED="\033[0;31m"
BLU="\033[0;34m"
DIM="\033[2m"
RST="\033[0m"

ok(){ echo -e " ${GRN}✓${RST} $*"; }
info(){ echo -e " ${YLW}→${RST} $*"; }
err(){ echo -e " ${RED}✗${RST} $*"; }
head(){ echo -e "\n${BLU}$*${RST}"; }
hr(){ echo -e "${DIM}────────────────────────────────────────────────────${RST}"; }

INSTALL_DIR="$HOME/.local/share/cc-widget"
CONFIG_DIR="$HOME/.config/cc-widget"
CACHE_DIR="$HOME/.cache/cc-widget"

DESKTOP="$HOME/.local/share/applications/cc-widget.desktop"
AUTOSTART="$HOME/.config/autostart/cc-widget.desktop"

ICON_ROOT="$HOME/.local/share/icons/hicolor"

echo
echo " ⬡  CC Widget Uninstaller"
hr

#
# Stop running widget
#

head "Stopping CC Widget..."

pkill -f "$INSTALL_DIR/launch.py" 2>/dev/null || true

sleep 1

ok "Done."

#
# Remove application
#

head "Removing application..."

rm -rf "$INSTALL_DIR"

ok "Application removed."

#
# Desktop launcher
#

head "Removing launcher..."

rm -f "$DESKTOP"
rm -f "$AUTOSTART"

update-desktop-database \
    "$HOME/.local/share/applications" \
    >/dev/null 2>&1 || true

ok "Launcher removed."

#
# Icons
#

head "Removing icons..."

rm -f "$ICON_ROOT/scalable/apps/cc-widget.svg"
rm -f "$ICON_ROOT/256x256/apps/cc-widget.png"

gtk-update-icon-cache "$ICON_ROOT" >/dev/null 2>&1 || true

ok "Icons removed."

#
# Cache
#

head "Removing cache..."

rm -rf "$CACHE_DIR"

ok "Cache removed."

#
# Settings
#

head "Configuration"

read -rp "Remove your saved settings too? [y/N] " CFG

if [[ "${CFG,,}" == "y" ]]; then

    rm -rf "$CONFIG_DIR"

    ok "Configuration removed."

else

    info "Keeping your settings."

fi

hr

echo
ok "CC Widget has been removed."

echo

if [[ "${CFG,,}" != "y" ]]; then
    echo "Your configuration remains in:"
    echo "  $CONFIG_DIR"
    echo
fi

echo "Thank you for trying CC Widget."

echo
