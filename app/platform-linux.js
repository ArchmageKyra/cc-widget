/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — platform-linux.js
   The boundary to launch.py (GTK host), the CoolerControl (CC) daemon, and
   the psutil stats launch.py pushes in. Everything outside this file sees only
   the generic devices/channels/temps shape, so porting to another OS/backend
   means replacing this file and launch.py.
   Depends on: themes.js, state.js (load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  GTK BRIDGE — host messaging
// ═══════════════════════════════════════════════════════════════
function gtksend(msg) {
  try {
    window.webkit.messageHandlers.ccm.postMessage(msg);
  } catch {}
}

// Top-anchored corners put the status bar (drag handle + controls) above the content.
function _applyBarPosition(corner) {
  document
    .getElementById("app")
    .classList.toggle("bar-top", corner === "top-left" || corner === "top-right");
}

function setAnchorCorner(corner) {
  cfg.anchorCorner = corner;
  saveCfg();
  _applyBarPosition(corner);
  document
    .querySelectorAll(".anchor-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.corner === corner));
  gtksend("anchor:" + corner);
  requestAnimationFrame(() => autoResize());
}

// Folder picker round trip: Python opens a native dialog and answers via
// onFolderPicked(). One slot suffices — the dialog is modal.
let _pendingFolderPick = null;

function pickFolder(onPicked) {
  _pendingFolderPick = onPicked;
  gtksend("pick-folder");
}

window.onFolderPicked = function (path) {
  const cb = _pendingFolderPick;
  _pendingFolderPick = null;
  if (path && cb) cb(path);
};

// Tells Python which folder-kind custom rows to size with `du`.
// Call whenever custom rows change.
function _sendFolderPaths() {
  const paths = [];
  for (const rows of Object.values(cfg.customRows ?? {})) {
    for (const row of rows) {
      if (row.kind === "folder" && row.path) paths.push(row.path);
    }
  }
  gtksend("watch:" + JSON.stringify(paths));
}

document.getElementById("bb-x").onclick = () => gtksend("close");
document.getElementById("bb-pin").onclick = () => {
  pinned = !pinned;
  gtksend(pinned ? "pin" : "unpin");
  document.getElementById("bb-pin").classList.toggle("on", pinned);
};

// Dragging the status bar (anywhere but its buttons) moves the window.
document.getElementById("sbar").addEventListener("mousedown", (e) => {
  if (!locked && !e.target.closest("button") && e.button === 0) {
    e.preventDefault();
    gtksend("dragstart");
  }
});


// ═══════════════════════════════════════════════════════════════
//  LINUX SYSTEM STATS — pushed by launch.py every 2 s
// ═══════════════════════════════════════════════════════════════
window.onLinuxStats = function (stats) {
  // Python pushes regardless of mode; ignore it while Demo Mode is faking
  // the dashboard so real and fake data don't fight over linuxDevices.
  if (demoMode) return;
  applyLinuxStats(stats);
};

// Wraps a stats payload as a synthetic "linux-system" device. Its channels
// use CC's field names: `duty` carries percentages and `watts` carries any
// other number (GB, KB/s).
function applyLinuxStats(stats) {
  if (stats.unavailable) {
    _resolveLinuxStatsReady?.();
    _resolveLinuxStatsReady = null;
    return;
  }

  const channels = [
    { name: "CPU Usage", duty: stats.cpu_percent },
    { name: "RAM Usage", duty: stats.ram_percent },
    { name: "RAM Used", watts: stats.ram_used_gb },
    { name: "RAM Free", watts: stats.ram_free_gb },
    { name: "RAM Total", watts: stats.ram_total_gb },
    { name: "Swap Usage", duty: stats.swap_percent },
    { name: "Swap Used", watts: stats.swap_used_gb },
    { name: "Swap Free", watts: stats.swap_free_gb },
    { name: "Swap Total", watts: stats.swap_total_gb },
    { name: "RX KB/s", watts: stats.net?.rx_kbps ?? 0 },
    { name: "TX KB/s", watts: stats.net?.tx_kbps ?? 0 },
  ];

  for (const [mount, disk] of Object.entries(stats.disks || {})) {
    channels.push(
      { name: `Disk ${mount} Usage`, duty: disk.percent },
      { name: `Disk ${mount} Used`, watts: disk.used_gb },
      { name: `Disk ${mount} Free`, watts: disk.free_gb },
      { name: `Disk ${mount} Total`, watts: disk.total_gb },
    );
  }

  // Folder sizes come from `du`, computed in the background by Python.
  for (const [path, gb] of Object.entries(stats.folder_sizes || {})) {
    channels.push({ name: `Folder ${path}`, watts: gb });
  }

  linuxDevices = [
    {
      uid: "linux-system",
      type: "Linux",
      type_index: 0,
      status_history: [
        { timestamp: new Date().toISOString(), temps: [], channels },
      ],
    },
  ];

  refreshDevices();

  _resolveLinuxStatsReady?.();
  _resolveLinuxStatsReady = null;
}

function refreshDevices() {
  liveDevices = [...ccDevices, ...linuxDevices];
  // First Linux data: assign the Linux slots once and rebuild the cards.
  if (!linuxAutoAssigned && linuxDevices.length) {
    linuxAutoAssigned = true;
    autoAssignLinux();
    if (phase === "dashboard") buildCards();
  }
  if (phase === "dashboard") renderDashboard(liveDevices);
}

// Maps well-known Linux channels onto their cfg.slots entries.
// Idempotent: already-assigned slots are left alone.
function autoAssignLinux() {
  const lat = getLatest(liveDevices.find((d) => d.uid === "linux-system"));
  if (!lat) return;

  // [slotId, channelName, field, unit]. Units are explicit because "watts"
  // is a generic carrier (GB, KB/s, W).
  const MAP = [
    ["cpu_load", "CPU Usage", "duty", "%"],
    ["lnx_ram_pct", "RAM Usage", "duty", "%"],
    ["lnx_ram_used", "RAM Used", "watts", "GB"],
    ["lnx_ram_total", "RAM Total", "watts", "GB"],
    ["lnx_swap_pct", "Swap Usage", "duty", "%"],
    ["lnx_swap_used", "Swap Used", "watts", "GB"],
    ["lnx_swap_tot", "Swap Total", "watts", "GB"],
    ["lnx_net_rx", "RX KB/s", "watts", "KB/s"],
    ["lnx_net_tx", "TX KB/s", "watts", "KB/s"],
  ];

  let changed = false;
  for (const [slotId, chName, field, unit] of MAP) {
    if (cfg.slots[slotId]) continue;
    if (!lat.channels?.some((c) => c.name === chName)) continue;
    cfg.slots[slotId] = {
      uid: "linux-system",
      kind: "channel",
      name: chName,
      field,
      unit,
      dLbl: "Linux",
      label: `Linux → ${chName}`,
    };
    changed = true;
  }
  if (changed) saveCfg();
}


// ═══════════════════════════════════════════════════════════════
//  COOLERCONTROL — device names + SSE status stream
// ═══════════════════════════════════════════════════════════════
const _authHeaders = () =>
  cfg.token ? { Authorization: "Bearer " + cfg.token } : {};

// CC's status stream carries only internal keys ("temp1", "fan1") and a bare
// device type. Friendly names live on two REST endpoints, fetched once per
// connection (buildLeaves() falls back to type/key labels until they land):
//   GET /devices          device name + per-sensor/channel labels
//   GET /settings/devices disable flags + user label overrides (these win)
async function fetchDeviceMeta() {
  try {
    const res = await fetch(cfg.baseUrl + "/devices", { headers: _authHeaders() });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const { devices } = await res.json();
    const meta = {};
    for (const dev of devices ?? []) {
      const temps = {},
        channels = {};
      for (const [key, info] of Object.entries(dev.info?.temps ?? {}))
        if (info?.label) temps[key] = info.label;
      for (const [key, info] of Object.entries(dev.info?.channels ?? {}))
        if (info?.label) channels[key] = info.label;
      meta[dev.uid] = { name: dev.name, disabled: false, temps, channels };
    }
    deviceMeta = meta;
  } catch {
    return; // non-fatal: keep what we had, or the type/key fallback
  }

  // Best-effort: older daemons lack this endpoint, and /devices names still apply.
  try {
    const res = await fetch(cfg.baseUrl + "/settings/devices", {
      headers: _authHeaders(),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const { devices } = await res.json();
    for (const dev of devices ?? []) {
      const m = deviceMeta[dev.uid];
      if (!m) continue;
      m.disabled = !!dev.disable;
      for (const [key, cs] of Object.entries(dev.channel_settings ?? {})) {
        if (cs?.label) m.channels[key] = cs.label;
      }
    }
  } catch {}
}

// Fetch-based SSE (EventSource can't send the Authorization header).
async function startSSE() {
  stopSSE();
  sseAbort = new AbortController();
  fetchDeviceMeta(); // fire-and-forget
  setStatus("spin", "Connecting…");
  while (true) {
    try {
      const res = await fetch(cfg.baseUrl + "/sse/status", {
        headers: _authHeaders(),
        signal: sseAbort.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const reader = res.body.getReader(),
        dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines)
          if (line.startsWith("data: "))
            try {
              onSSEPacket(JSON.parse(line.slice(6)));
            } catch {}
      }
      setStatus("spin", "Reconnecting…");
      await sleep(1000);
    } catch (e) {
      if (e.name === "AbortError") return;
      setStatus("err", "SSE lost — retrying");
      await sleep(3000);
    }
  }
}

function stopSSE() {
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = null;
  }
}

function onSSEPacket(payload) {
  ccDevices = payload.devices ?? [];
  refreshDevices();
  if (phase === "connecting") {
    bootStepDone("daemon", () => {
      bootStep("live", "active");
      bootState("Starting telemetry");
    });

    phase = "dashboard";

    // First-time setup (nothing CC-assignable configured yet) opens in edit mode.
    const hasCCSlots = CARD_DEFS.some((def) =>
      def.rows?.some((r) => !r.autoLinux && r.typeFilter && cfg.slots[r.sid]),
    );
    editMode = !hasCCSlots;
    buildCards();
    _sendFolderPaths(); // re-sync Python with persisted folder rows
    showScreen();

    // Linux stats arrive on Python's own 2 s timer. Wait for the first
    // sample so the card rebuild it triggers lands before the boot reveal,
    // otherwise it can resize the window again after the reveal.
    linuxStatsReady.then(() => {
      bootStepDone("live", () => {
        bootState("Online");
        setTimeout(hideBootScreen, BOOT_READ_DELAY);
      });
    });

    requestAnimationFrame(_syncEditChrome);
  }
  if (phase === "dashboard") setStatus("ok");
}


// ═══════════════════════════════════════════════════════════════
//  CONNECTION STATUS
// ═══════════════════════════════════════════════════════════════
// Writes the status dot + text to the status bar and to the drawer's
// Connection section, which mirror each other.
function _paintStatus(dotClass, text) {
  const cls = "sdot" + (dotClass ? " " + dotClass : "");
  document.getElementById("sdot").className = cls;
  const stxt = document.getElementById("stxt");
  stxt.textContent = text;
  stxt.classList.toggle("demo-active", demoMode);

  const csdot = document.getElementById("conn-status-dot");
  const cstxt = document.getElementById("conn-status-text");
  if (csdot) csdot.className = cls;
  if (cstxt) cstxt.textContent = text;
  _updateConnTooltip(dotClass);
}

function setStatus(cls, msg = "") {
  // Demo Mode owns the indicator while running: fake data never reads "Live".
  if (demoMode) {
    _paintStatus("demo", "DEMO · " + (DEMO_SCENARIOS[demoScenario]?.label ?? "Normal"));
  } else {
    _paintStatus(cls, cls === "ok" ? "Live" : cls === "err" ? msg : msg || "…");
  }

  if (cls === "ok") {
    if (!_connectTime) _connectTime = Date.now();
    const up = document.getElementById("sbar-uptime");
    if (up) up.textContent = _fmtUptime(Date.now() - _connectTime);
  }
  // An unreachable daemon during boot: show the dashboard now rather than
  // leaving the user on the boot screen while SSE retries.
  if (cls === "err" && phase === "connecting") hideBootScreen();
}

// Idle "—" state, for when no connection attempt is in flight (e.g. leaving
// Demo Mode with no token saved).
function _resetConnIndicator() {
  _paintStatus(null, "—");
}

// Longer hover explanation for the drawer's Connection readout.
function _updateConnTooltip(dotClass) {
  const wrap = document.getElementById("conn-status");
  if (!wrap) return;
  const tips = {
    demo: "Showing sample data. Paste a token below to connect your real hardware.",
    ok: "Connected to your daemon.",
    err: "Couldn't reach the daemon — check the URL and token below.",
    spin: "Attempting to connect…",
  };
  wrap.title = tips[dotClass] || "";
}


// ═══════════════════════════════════════════════════════════════
//  AUTO-RESIZE
//  Measures the real content height and tells Python to fit the GTK window
//  to it — no scrolling, no dead space.
// ═══════════════════════════════════════════════════════════════
const DRAWER_W = 320; // matches #drawer's fixed width in monitor.css

function autoResize(force = false) {
  const boot = document.getElementById("boot-screen");
  if (!force && boot && !boot.classList.contains("hide")) return;

  const sbarH = document.getElementById("sbar").offsetHeight;
  const borders = 2; // #app top + bottom border
  const screenPad = 24; // .screen padding: 12px × 2
  const baseW = (SIZES[cfg.size] || SIZES.s).width;
  const cardsH = document.getElementById("cards").scrollHeight;

  let w = baseW;
  let contentH = cardsH + screenPad;
  if (drawerOpen) {
    // The drawer sits beside the dashboard: widen the window for both
    // columns and follow the taller one (+4px absorbs rounding so the
    // drawer doesn't grow a hairline scrollbar).
    const inner = document.querySelector(".drawer-inner");
    const drawerH = inner ? inner.scrollHeight + 4 : 0;
    w = baseW + DRAWER_W;
    contentH = Math.max(contentH, drawerH);
  }

  gtksend("resize:" + w + ":" + (contentH + sbarH + borders));
}
