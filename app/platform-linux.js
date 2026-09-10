/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — platform-linux.js
   ────────────────────────────────────────────────────────────────────────────
   The entire boundary to launch.py, GTK, and the CoolerControl daemon.
   Everything here either sends a message to the Python host (gtksend and its
   call sites) or is the receiving/normalizing end of data from a specific
   backend (CC's SSE + REST API, or the psutil stats launch.py pushes in).

   Porting to another OS/backend (e.g. Windows + LibreHardwareMonitor) means
   replacing this file (and launch.py) — nothing outside it should need to
   change, since the rest of the app only ever touches the generic
   devices/channels/temps shape, never the source.

   Depends on: themes.js, state.js (must load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  ANCHOR CORNER
// ═══════════════════════════════════════════════════════════════
function setAnchorCorner(corner) {
  cfg.anchorCorner = corner;
  saveCfg();
  document
    .getElementById("app")
    .classList.toggle(
      "bar-top",
      corner === "top-left" || corner === "top-right",
    );
  document
    .querySelectorAll(".anchor-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.corner === corner));
  gtksend("anchor:" + corner);
  requestAnimationFrame(() => autoResize());
}


// ═══════════════════════════════════════════════════════════════
//  GTK BRIDGE — host messaging
// ═══════════════════════════════════════════════════════════════
function gtksend(msg) {
  try {
    window.webkit.messageHandlers.ccm.postMessage(msg);
  } catch {}
}

document.getElementById("bb-x").onclick = () => gtksend("close");
document.getElementById("bb-pin").onclick = () => {
  pinned = !pinned;
  gtksend(pinned ? "pin" : "unpin");
  document.getElementById("bb-pin").classList.toggle("on", pinned);
};

// ── Status bar drag (left zone, not buttons) ───────────────────
document.getElementById("sbar").addEventListener("mousedown", (e) => {
  if (!locked && !e.target.closest("button") && e.button === 0) {
    e.preventDefault();
    gtksend("dragstart");
  }
});

// ═══════════════════════════════════════════════════════════════
//  LINUX SYSTEM STATS
//  Python calls window.onLinuxStats(stats) every 2 s via
//  webview.run_javascript() — no HTTP server needed.
// ═══════════════════════════════════════════════════════════════
window.onLinuxStats = function (stats) {
  // Python's push loop runs unconditionally on its own GLib timer —
  // ignore its real samples while Demo Mode is faking the dashboard,
  // otherwise real/fake data would fight over linuxDevices every 2s.
  if (demoMode) return;
  applyLinuxStats(stats);
};

function applyLinuxStats(stats) {
  if (stats.unavailable) {
    _resolveLinuxStatsReady?.();
    _resolveLinuxStatsReady = null;
    return;
  }

  const channels = [
    {
      name: "CPU Usage",
      duty: stats.cpu_percent,
    },
    {
      name: "RAM Usage",
      duty: stats.ram_percent,
    },
    {
      name: "RAM Used",
      watts: stats.ram_used_gb,
    },
    {
      name: "RAM Free",
      watts: stats.ram_free_gb,
    },
    {
      name: "RAM Total",
      watts: stats.ram_total_gb,
    },
    {
      name: "Swap Usage",
      duty: stats.swap_percent,
    },
    {
      name: "Swap Used",
      watts: stats.swap_used_gb ?? stats.swap_used ?? stats.swap_used_gib,
    },
    {
      name: "Swap Free",
      watts: stats.swap_free_gb ?? stats.swap_free ?? stats.swap_free_gib,
    },
    {
      name: "Swap Total",
      watts: stats.swap_total_gb ?? stats.swap_total ?? stats.swap_total_gib,
    },
    {
      name: "RX KB/s",
      watts: stats.net?.rx_kbps ?? 0,
    },
    {
      name: "TX KB/s",
      watts: stats.net?.tx_kbps ?? 0,
    },
  ];

  Object.entries(stats.disks || {}).forEach(([mount, disk]) => {
    channels.push(
      { name: `Disk ${mount} Usage`, duty: disk.percent },
      { name: `Disk ${mount} Used`, watts: disk.used_gb },
      { name: `Disk ${mount} Free`, watts: disk.free_gb },
      { name: `Disk ${mount} Total`, watts: disk.total_gb },
    );
  });

  // Folder sizes from du (background-computed by Python)
  Object.entries(stats.folder_sizes || {}).forEach(([path, gb]) => {
    channels.push({ name: `Folder ${path}`, watts: gb });
  });

  linuxDevices = [
    {
      uid: "linux-system",
      type: "Linux",
      type_index: 0,
      status_history: [
        {
          timestamp: new Date().toISOString(),
          temps: [],
          channels,
        },
      ],
    },
  ];

  refreshDevices();

  _resolveLinuxStatsReady?.();
  _resolveLinuxStatsReady = null;
}

// ═══════════════════════════════════════════════════════════════
//  SSE  (fetch-based — carries Authorization header)
// ═══════════════════════════════════════════════════════════════
function refreshDevices() {
  liveDevices = [...ccDevices, ...linuxDevices];
  // Auto-assign Linux slots once, the first time we have Linux data
  if (!linuxAutoAssigned && linuxDevices.length) {
    linuxAutoAssigned = true;
    autoAssignLinux();
    if (phase === "dashboard") {
      buildCards();
    }
  }
  if (phase === "dashboard") renderDashboard(liveDevices);
}

// ═══════════════════════════════════════════════════════════════
//  DEVICE META — friendly names
//  CC's live status stream only carries internal keys ("temp1",
//  "fan1", etc.) and a bare device type ("Liquidctl"). The actual
//  human-readable names live on two separate REST endpoints:
//    GET /devices          → dev.name (device), info.temps[key].label,
//                             info.channels[key].label (sensor/channel)
//    GET /settings/devices  → disable flags + per-channel label
//                             overrides (CC's own "rename sensor" field,
//                             which wins over the device's default label)
//  Fetched once per connection; buildLeaves() falls back to the old
//  type/key-based labels if a uid or key isn't found here (e.g. this
//  fetch hasn't completed yet, or an older daemon lacks an endpoint).
// ═══════════════════════════════════════════════════════════════
async function fetchDeviceMeta() {
  const authHeaders = cfg.token ? { Authorization: "Bearer " + cfg.token } : {};
  try {
    const res = await fetch(cfg.baseUrl + "/devices", { headers: authHeaders });
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
    return; // keep whatever we had (or the type/key fallback) — non-fatal
  }

  // Settings pass: device-level disable + per-channel label overrides.
  // Best-effort — if this one 404s (older daemon) the /devices names
  // fetched above still apply.
  try {
    const res = await fetch(cfg.baseUrl + "/settings/devices", {
      headers: authHeaders,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const { devices } = await res.json();
    for (const dev of devices ?? []) {
      const m = deviceMeta[dev.uid];
      if (!m) continue;
      m.disabled = !!dev.disable;
      for (const [key, cs] of Object.entries(dev.channel_settings ?? {})) {
        if (cs?.label) m.channels[key] = cs.label; // user override wins
      }
    }
  } catch {
    // /devices names are still good without this
  }
}

async function startSSE() {
  stopSSE();
  sseAbort = new AbortController();
  fetchDeviceMeta(); // fire-and-forget — buildLeaves() falls back until it resolves
  setStatus("spin", "Connecting…");
  while (true) {
    try {
      const res = await fetch(cfg.baseUrl + "/sse/status", {
        headers: cfg.token ? { Authorization: "Bearer " + cfg.token } : {},
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

    // Check if any CC-assignable slots are already configured
    const hasCCSlots = CARD_DEFS.some((def) =>
      def.rows?.some((r) => !r.autoLinux && r.typeFilter && cfg.slots[r.sid]),
    );
    // Enter edit mode automatically on first-time setup
    editMode = !hasCCSlots;
    buildCards();
    _sendFolderPaths(); // Re-sync Python with any persisted folder rows
    showScreen();

    // Wait for the first Linux stats sample too (it's on its own,
    // unsynced 2s timer) so the card rebuild it triggers has already
    // happened before we call this "ready" — otherwise it can land after
    // the reveal and pop the window again.
    linuxStatsReady.then(() => {
      bootStepDone("live", () => {
        bootState("Online");
        // Hold the finished state on screen for a beat before starting
        // the reveal, so it doesn't just flicker past.
        setTimeout(hideBootScreen, BOOT_READ_DELAY);
      });
    });

    // Update gear button state after screen transition
    requestAnimationFrame(() => {
      const btn = document.getElementById("bb-cfg");
      if (btn) {
        btn.innerHTML = editMode ? _ICON_CHECK : _ICON_PENCIL;
        btn.classList.toggle("on", editMode);
      }
      if (editMode) document.getElementById("cards")?.classList.add("editing");
    });
  }
  if (phase === "dashboard") setStatus("ok");
}

function setStatus(cls, msg = "") {
  const sdot = document.getElementById("sdot");
  const stxt = document.getElementById("stxt");
  // Demo Mode owns the indicator whenever it's running — a fake connection
  // shouldn't ever read as "Live", so this branch overrides whatever cls
  // the caller (demoTick's setStatus("ok")) passed in.
  let dotClass, text;
  if (demoMode) {
    dotClass = "demo";
    text = "DEMO · " + (DEMO_SCENARIOS[demoScenario]?.label ?? "Normal");
  } else {
    dotClass = cls;
    text = cls === "ok" ? "Live" : cls === "err" ? msg : msg || "…";
  }
  sdot.className = "sdot " + dotClass;
  stxt.textContent = text;
  stxt.classList.toggle("demo-active", demoMode);

  // The drawer's Connection section mirrors this exactly — same dot
  // class, same short text — instead of keeping its own separate,
  // wordier copy that could drift out of sync.
  const csdot = document.getElementById("conn-status-dot");
  const cstxt = document.getElementById("conn-status-text");
  if (csdot) csdot.className = "sdot " + dotClass;
  if (cstxt) cstxt.textContent = text;
  _updateConnTooltip(dotClass);

  if (cls === "ok") {
    if (!_connectTime) _connectTime = Date.now();
    const up = document.getElementById("sbar-uptime");
    if (up) up.textContent = _fmtUptime(Date.now() - _connectTime);
  }
  // A failed attempt during the initial boot connect means the daemon
  // isn't reachable — surface the dashboard right away instead of
  // leaving the user staring at the boot screen until it retries into
  // eternity (the failsafe timer is just a backstop for this).
  if (cls === "err" && phase === "connecting") hideBootScreen();
}

// Longer explanation on hover, for anyone who wants more than the
// short mirrored text — new users especially.
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

// Resets both the sbar and drawer indicators to their idle "—" state —
// used when there's genuinely no connection attempt in flight (e.g.
// leaving Demo Mode with no token to reconnect with), which isn't one
// of setStatus()'s ok/err/spin cases.
function _resetConnIndicator() {
  const sdot = document.getElementById("sdot");
  const stxt = document.getElementById("stxt");
  sdot.className = "sdot";
  stxt.textContent = "—";
  stxt.classList.remove("demo-active");
  const csdot = document.getElementById("conn-status-dot");
  const cstxt = document.getElementById("conn-status-text");
  if (csdot) csdot.className = "sdot";
  if (cstxt) cstxt.textContent = "—";
  _updateConnTooltip(null);
}

// Collects all folder-kind custom row paths across every card and tells
// Python which paths to track via du.  Call whenever custom rows change.
// Collects all folder-kind custom row paths across every card and tells
// Python which paths to track via du.  Call whenever custom rows change.
function _sendFolderPaths() {
  const paths = [];
  for (const rows of Object.values(cfg.customRows ?? {})) {
    for (const row of rows) {
      if (row.kind === "folder" && row.path) paths.push(row.path);
    }
  }
  gtksend("watch:" + JSON.stringify(paths));
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-ASSIGN LINUX SLOTS
//  Maps well-known Linux stats to their cfg.slots entries.
//  Idempotent — skips slots that are already assigned.
// ═══════════════════════════════════════════════════════════════
function autoAssignLinux() {
  const linuxDev = liveDevices.find((d) => d.uid === "linux-system");
  if (!linuxDev) return;
  const lat = getLatest(linuxDev);
  if (!lat) return;

  // [slotId, channelName, field, unit] — unit is explicit per-entry
  // rather than derived from field, since "watts" is a generic numeric
  // carrier reused for GB (folders), KB/s (network), and actual W.
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
    const ch = lat.channels?.find((c) => c.name === chName);
    if (!ch) continue;
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
//  AUTO-RESIZE
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  AUTO-RESIZE
//  Measures true card content height and notifies Python so the
//  GTK window snaps to fit — no scroll, no dead space.
// ═══════════════════════════════════════════════════════════════
const DRAWER_W = 320; // matches #drawer's fixed width in monitor.css

function autoResize(force = false) {
  const boot = document.getElementById("boot-screen");
  if (!force && boot && !boot.classList.contains("hide")) {
    return;
  }

  const sbarH = document.getElementById("sbar").offsetHeight;
  const borders = 2; // #app top + bottom border

  const baseW = (SIZES[cfg.size] || SIZES.s).width;
  const screenPad = 24; // .screen { padding: 12px } × 2 sides
  const cardsH = document.getElementById("cards").scrollHeight;

  let w, contentH;
  if (drawerOpen) {
    // Drawer sits beside the dashboard, not on top — window widens to fit
    // both columns; height follows the taller one. +4px covers rounding
    // so a hairline scrollbar doesn't appear in the drawer.
    const inner = document.querySelector(".drawer-inner");
    const drawerH = inner ? inner.scrollHeight + 4 : 0;
    w = baseW + DRAWER_W;
    contentH = Math.max(cardsH + screenPad, drawerH);
  } else {
    w = baseW;
    contentH = cardsH + screenPad;
  }

  const h = contentH + sbarH + borders;
  gtksend("resize:" + w + ":" + h);
}

