# CC Widget

A lightweight desktop hardware monitor for Linux, powered by [CoolerControl](https://gitlab.com/coolercontrol/coolercontrol).

CC Widget is built to feel like part of your desktop, not another bulky monitoring app competing for attention. It's a small, borderless, always-on-top widget showing live CPU, GPU, memory, storage, network, and fan telemetry - configurable, themeable, and out of your way.

![CC Widget demo](cc-monitor-demo.gif)

---

## Features

* **Live hardware telemetry** - CPU/GPU temps and load, fan speeds, RAM/swap, disk usage, network throughput - sourced from the [CoolerControl](https://gitlab.com/coolercontrol/coolercontrol) daemon and local Linux system stats
* **Sparkline graphs** with session peak markers, per-metric
* **Three size presets** (S/M/L) and a choice of screen corner to anchor to, so it sits where you want it
* **A real theme system** - eleven built-in themes plus a live theme builder with contrast checking, so you can tune colors and confirm they're actually readable before committing. Pick a random theme on every launch if you like variety
* **Save & Share** - copy a theme as text to send to a friend (or paste one you were sent), and export or import your whole setup - theme, layout, and window position - as a file
* **Try it before you connect** - a new install starts in demo mode with sample data, so you can look around and set things up before pasting in a token
* **Configurable dashboard** - assign any sensor to any row, add custom rows, even track arbitrary folder sizes on disk
* **Lightweight** - GTK3 + WebKit2, no Electron, minimal footprint
* **Native desktop integration** - proper `.desktop` launcher, optional autostart, standard icon placement

---

## Requirements

* Ubuntu 24.04 or a compatible Debian-based distribution
* [CoolerControl](https://gitlab.com/coolercontrol/coolercontrol) installed and running (see the [docs](https://docs.coolercontrol.org) for setup)
* Python 3

The installer takes care of the rest (`python3-gi`, `gir1.2-webkit2-4.1`, `python3-psutil`) via `apt`.

---

## Installation

Extract the release anywhere - your Downloads folder is fine - and run:

```bash
bash install.sh
```
The installer will:

* Check for and install any missing system dependencies
* Copy CC Widget into `~/.local/share/cc-widget`
* Install the app icon and create a desktop launcher
* Offer to enable autostart

Once installation finishes, the extracted download folder can be deleted.

### First run

Launch CC Widget from your app launcher, or:

```bash
python3 ~/.local/share/cc-widget/launch.py
```

The settings drawer opens on first launch in demo mode. Under **System → Connection**, enter your CoolerControl daemon URL and an access token (the token field pulses until you fill it in). Create a token in CoolerControl under **Settings → Access Protection → Access Tokens**, paste it in, and you're connected.

Open the drawer any time from the gear in the bottom bar. It holds Size, Position, Theme, Connection, and Save & Share, plus **Reset Widget** at the bottom if you want to start over.

---

## Updating

Download a newer release and run the installer again:

```bash
bash install.sh
```

Your installed app files are replaced, but your connection, theme, and layout are untouched - those live outside the install directory (see [Configuration & Data Locations](#configuration--data-locations) below).

---

## Uninstalling

```bash
bash uninstall.sh
```

This removes the application, desktop launcher, icon, and cache. It will also ask separately whether to remove your saved configuration - say no if you think you might reinstall later and want to pick up where you left off.

---

## Configuration & Data Locations

CC Widget follows standard XDG conventions, so everything lives where you'd expect to find it (or clean it up) on any Linux system:

| What                                   | Where                          |
|-----------------------------------------|--------------------------------|
| App files                               | `~/.local/share/cc-widget/`    |
| Window position                        | `~/.config/cc-widget/`         |
| Connection, theme, and layout settings  | `~/.config/cc-widget/webkit-data/` |
| Cache                                   | `~/.cache/cc-widget/`          |
| Desktop launcher                        | `~/.local/share/applications/cc-widget.desktop` |
| Icon                                    | `~/.local/share/icons/hicolor/.../cc-widget.*` |

---

## Project Structure

```
cc-widget/
├── install.sh
├── uninstall.sh
├── README.md
└── app/
    ├── launch.py            GTK/WebKit window: sizing, anchoring, position
    ├── monitor.html         page structure and the settings drawer
    ├── monitor.css
    ├── themes.js            theme catalog and size presets
    ├── state.js             config, shared helpers, icons
    ├── platform-linux.js    daemon connection and system stats
    ├── ui-widgets.js        row menus, sensor picker, custom rows
    ├── dashboard.js         cards, rows, sparklines
    ├── app-modes.js         boot, demo mode, theme builder, entry point
    ├── dev.js               developer tools (not installed, see below)
    ├── icon.svg
    └── ...
```

The scripts are plain files loaded in order from `monitor.html` - no build step, no bundler.

---

## Development

Run straight from a clone with `python3 app/launch.py`.

`app/dev.js` is optional. If it's present next to `monitor.html`, it adds a **Dev** zone to the drawer: extra demo scenarios (Idle, Gaming, Stress), a theme auto-cycle button, and a "simulate first launch" action. If it's missing, the app skips it silently.

The installer never copies `dev.js` into `~/.local/share/cc-widget`, so installed copies don't get the Dev zone even though the file ships in the repo.

---

## Acknowledgements

CC Widget wouldn't exist without [CoolerControl](https://gitlab.com/coolercontrol/coolercontrol), which does all the actual work of talking to hardware sensors and fan controllers - this widget is just a small, focused window onto that data.

The app icon was adapted from the [Hatter](https://github.com/Mibea/Hatter) icon theme.

Thanks also to the broader Linux desktop community and the open-source libraries this project builds on: GTK, WebKit2GTK, and psutil.

---

Enjoy your dashboard.
