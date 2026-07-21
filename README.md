# CC Widget

A lightweight desktop hardware monitor for Linux, powered by CoolerControl.

CC Widget is designed to feel like part of your desktop - not another bulky monitoring application. It provides live system telemetry in a compact, always-available widget with configurable layouts, themes, sparklines, and hardware monitoring.

---

## Features

* Live CPU, GPU, memory, storage, and fan monitoring
* Powered by the CoolerControl daemon
* Lightweight GTK + WebKit interface
* Themeable UI with multiple built-in themes
* Sparklines and configurable dashboard layouts
* Optional autostart
* Native desktop launcher integration

---

## Requirements

* Ubuntu 24.04 or compatible Debian-based distribution
* CoolerControl installed and running
* Python 3

The installer will automatically install any required runtime dependencies.

---

## Installation

Extract the release anywhere and run:

```bash
chmod +x install.sh
./install.sh
```

The installer will:

* Install any required dependencies
* Copy CC Widget into your local applications directory
* Create an application launcher
* Optionally enable autostart
* Offer to launch the widget immediately

Once installation is complete, the extracted download folder may be safely deleted.

---

## Updating

Download a newer release and simply run the installer again.

Your existing installation will be upgraded while preserving your saved configuration.

---

## Uninstalling

Run:

```bash
./uninstall.sh
```

The uninstaller removes the application, desktop launcher, icons, and cache. It will also offer to remove your saved configuration.

---

## Project Structure

```
CC-Widget/
├── install.sh
├── uninstall.sh
├── README.md
└── app/
    ├── launch.py
    ├── monitor.html
    ├── version.txt
    ├── assets/
    └── ...
```

---

## Acknowledgements

CC Widget would not exist without the excellent CoolerControl project, which provides the hardware telemetry and control interface that powers the widget.

Thanks as well to the Linux desktop community and the creators of the open-source libraries, themes, and tools that make projects like this possible.

---

Enjoy your dashboard.
