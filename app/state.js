/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — state.js
   ────────────────────────────────────────────────────────────────────────────
   Global config/state, the sensor slot & warning-threshold model, generic
   utilities, and the settings-drawer/edit-mode toggles. Everything here is
   platform-agnostic — it only knows about the generic devices/channels
   shape, never where that data actually came from.
   Depends on: themes.js (must load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  SLOTS & THRESHOLDS
// ═══════════════════════════════════════════════════════════════
const SLOTS = [
  // CPU
  { id: "cpu_temp", lbl: "CPU Temp", cls: "cpu", unit: "°C" },
  { id: "cpu_load", lbl: "CPU Load", cls: "cpu", unit: "%" },
  { id: "cpu_fan", lbl: "CPU Fan", cls: "cpu", unit: "RPM" },

  // GPU
  { id: "gpu_temp", lbl: "GPU Temp", cls: "gpu", unit: "°C" },
  { id: "gpu_load", lbl: "GPU Load", cls: "gpu", unit: "%" },
  { id: "gpu_fan", lbl: "GPU Fan", cls: "gpu", unit: "RPM" },

  // MEMORY
  { id: "lnx_ram_pct", lbl: "RAM %", cls: "ram", unit: "%" },
  {
    id: "lnx_ram_used",
    lbl: "RAM Used GB",
    cls: "ram",
    unit: "GB",
  },
  {
    id: "lnx_ram_total",
    lbl: "RAM Total GB",
    cls: "ram",
    unit: "GB",
  },
  { id: "lnx_swap_pct", lbl: "Swap %", cls: "ram", unit: "%" },
  {
    id: "lnx_swap_used",
    lbl: "Swap Used GB",
    cls: "ram",
    unit: "GB",
  },
  {
    id: "lnx_swap_tot",
    lbl: "Swap Total GB",
    cls: "ram",
    unit: "GB",
  },

  // SSD
  { id: "disk_a_pct", lbl: "Disk A %", cls: "ssd", unit: "%" },
  {
    id: "disk_a_used",
    lbl: "Disk A Used GB",
    cls: "ssd",
    unit: "GB",
  },
  {
    id: "disk_a_total",
    lbl: "Disk A Total GB",
    cls: "ssd",
    unit: "GB",
  },
  {
    id: "disk_a_temp",
    lbl: "Disk A Temp",
    cls: "ssd",
    unit: "°C",
  },

  // NETWORK
  {
    id: "lnx_net_rx",
    lbl: "Net RX KB/s",
    cls: "net",
    unit: "KB/s",
  },
  {
    id: "lnx_net_tx",
    lbl: "Net TX KB/s",
    cls: "net",
    unit: "KB/s",
  },

  {
    id: "case_temp",
    lbl: "Case Ambient",
    cls: "fan",
    unit: "°C",
  },
];

// Two threshold modes:
//   "absolute" — real throttle and any 0–100% capacity row.
//   "relative" — offsets above a rolling baseline.
const PCT_LEVELS = [0, 25, 50, 75, 100];

const WARN_T = {
  cpu_temp: { mode: "absolute", levels: [35, 55, 72, 82, 92] },
  cpu_load: { mode: "absolute", levels: PCT_LEVELS },
  gpu_temp: { mode: "absolute", levels: [35, 55, 72, 82, 92] },
  gpu_load: { mode: "absolute", levels: PCT_LEVELS },
  lnx_ram_pct: { mode: "absolute", levels: PCT_LEVELS },
  lnx_swap_pct: { mode: "absolute", levels: PCT_LEVELS },
  case_temp: { mode: "relative", levels: [3, 6, 10, 14, 18] },
  ram_temp: { mode: "relative", levels: [8, 14, 20, 28, 36] },
  disk_a_temp: { mode: "relative", levels: [10, 18, 26, 35, 45] },
};

const BASELINE_WINDOW_MS = 30 * 60 * 1000;
const _baselineHist = {}; // sid -> [{t, v}, …] oldest-first

// Rolling 30-min minimum for a sensor — "relative" warn levels (ambient
// temps that have no fixed safe number, only a safe *rise* from
// whatever's normal right now) compare against this instead of 0.
function _relBaseline(sid, val) {
  const hist = (_baselineHist[sid] ??= []);
  const now = Date.now();
  hist.push({ t: now, v: val });
  const cutoff = now - BASELINE_WINDOW_MS;
  while (hist.length > 1 && hist[0].t < cutoff) hist.shift();
  let min = hist[0].v;
  for (const p of hist) if (p.v < min) min = p.v;
  return min;
}

// Dispatches to absolute (val vs fixed thresholds) or relative (delta
// vs _relBaseline) scoring depending on the sensor's WARN_T spec.
function warnLevel(slotId, val) {
  const spec = WARN_T[slotId];
  if (!spec) return 2;
  if (typeof val !== "number" || isNaN(val)) return 0;

  if (spec.mode === "relative") {
    const delta = val - _relBaseline(slotId, val);
    let lvl = 0;
    for (const d of spec.levels) {
      if (delta >= d) lvl++;
      else break;
    }
    return Math.max(1, lvl);
  }

  let lvl = 0;
  for (const thresh of spec.levels) {
    if (val >= thresh) lvl++;
    else break;
  }
  return lvl;
}

function dutyLevel(duty) {
  if (typeof duty !== "number") return 0;
  return Math.min(5, Math.ceil(duty / 20));
}


// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════
const HC_URL = "";
const HC_TOKEN = "";

let cfg = {
  baseUrl: "http://localhost:11987",
  token: "",
  slots: {},
  theme: "misty-metal",
  customThemeCSS: "",
  size: "s",
  hiddenMounts: [],
  rowStyles: {},
  customRows: {},
  rowOrder: {},
  cardOrder: [],
  sparkOff: {},
  peakOff: {},
  cardAlertOff: {},
  cardHidden: {},
  cardLabels: {},
  cardMini: {},
  anchorCorner: null,
  demoScenario: "normal",
  themeCycling: false,
  themeShuffleOnBoot: false,
};
let phase = "setup";
let _connectTime = 0; // epoch ms when SSE first went live
let ccDevices = [];
let linuxDevices = [];
let liveDevices = [];
let editMode = false;
let drawerOpen = false; // settings drawer — normally moves in lockstep with editMode via the gear button
let pickerCtx = null;
let linuxAutoAssigned = false;
let sseAbort = null;
let pinned = false;
let locked = false;
let sparks = {};
// Highest value seen per sid since launch — resets on relaunch by design
// ("session" peak), surfaced via the existing hover sub-tip mechanism.
let sessionPeaks = {};
// Friendly names — populated once per connection from CC's /devices and
// /settings/devices endpoints, keyed by device uid. See fetchDeviceMeta().
// uid -> { name, disabled, temps: {key: label}, channels: {key: label} }
let deviceMeta = {};

// Demo Mode — fake data curves standing in for a live CC connection.
// See the "DEMO MODE" section below for enterDemoMode()/exitDemoMode().
let demoMode = false;
let demoTimer = null;
let demoCurves = null;
let demoScenario = "normal"; // synced from cfg.demoScenario once loadCfg() runs
let themeCycling = false;
let themeCycleTimer = null;
const THEME_CYCLE_MS = 6000;

function _fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return d + "d " + (h % 24) + "h";
  if (h > 0) return h + "h " + (m % 60) + "m";
  if (m > 0) return m + "m";
  return s + "s";
}

// Tick uptime every 30 s while live
setInterval(() => {
  if (_connectTime && phase === "dashboard") {
    const el = document.getElementById("sbar-uptime");
    if (el) el.textContent = _fmtUptime(Date.now() - _connectTime);
  }
}, 30000);


// ═══════════════════════════════════════════════════════════════
//  PERSISTENCE
// ═══════════════════════════════════════════════════════════════
function loadCfg() {
  try {
    Object.assign(cfg, JSON.parse(localStorage.getItem("ccm") || "{}"));
  } catch {}
  if (HC_URL) cfg.baseUrl = HC_URL;
  if (HC_TOKEN) cfg.token = HC_TOKEN;
}
function saveCfg() {
  localStorage.setItem("ccm", JSON.stringify(cfg));
}


// ═══════════════════════════════════════════════════════════════
//  SETTINGS DRAWER / UI TOGGLES
// ═══════════════════════════════════════════════════════════════
document.getElementById("bb-mini-all").onclick = () => {
  if (!editMode) toggleAllCardsMini();
};
document.getElementById("bb-lock").onclick = () => {
  locked = !locked;
  document.getElementById("bb-lock").classList.toggle("on", locked);
  document.getElementById("app").classList.toggle("locked", locked);
};
// ── Settings drawer toggle (single gear button) ────────────────
// One button now drives editMode + the settings drawer together: the
// row-editing affordances on the dashboard and the theme/size/connection
// drawer open and close as one unit. See setConfigOpen().
const _drawer = document.getElementById("drawer");
let _themeScreenInited = false;
function setConfigOpen(open) {
  drawerOpen = open;
  setEditMode(open); // updates editMode, the gear icon, and #cards state
  _drawer.classList.toggle("open", open);
  if (open) {
    if (!_themeScreenInited) {
      initThemeScreen();
      _themeScreenInited = true;
    } else {
      // Refresh connection fields in case config changed since last open
      document.getElementById("tc-url").value = cfg.baseUrl;
      document.getElementById("tc-tok").value = cfg.token;
    }
    _updateDemoButtons();
  }
  requestAnimationFrame(() => autoResize());
}

document.getElementById("bb-cfg").onclick = () => setConfigOpen(!drawerOpen);

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const el = (tag, cls = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
const cssVar = (v) =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt1 = (v, u) =>
  typeof v !== "number"
    ? "--"
    : u === "°C" || u === "KB/s"
      ? v.toFixed(1)
      : u === "GB"
        ? v.toFixed(2)
        : Math.round(v).toString();

// Formats an elapsed-time span (ms) for the sparkline's time-horizon
// label — e.g. "48s", "2m". Returns null while there isn't enough
// history yet to be worth showing (avoids a flash of "0s" on launch).
function _fmtSpan(ms) {
  if (typeof ms !== "number" || ms < 4000) return null;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

// Closes the picker and re-measures content height. There's only ever
// one screen (the dashboard) now, so this is just the shared "something
// changed, resync the window" step — kept as a named function since
// several call sites read more clearly this way than a bare pair of
// calls.
function showScreen() {
  closePicker();
  requestAnimationFrame(() => autoResize());
}

function withAlpha(color, a) {
  color = (color || "").trim();
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16),
      g = parseInt(color.slice(3, 5), 16),
      b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  if (color.startsWith("rgba("))
    return color.replace(/,\s*[\d.]+\s*\)$/, `,${a})`);
  if (color.startsWith("rgb("))
    return color.replace("rgb(", "rgba(").replace(")", `,${a})`);
  return `rgba(128,128,128,${a})`;
}

// ── WCAG 2.x contrast ratio (hex-only — Theme Builder swatches are
//    always #rrggbb) ── returns a value from 1 (no contrast) to 21.
function wcagContrast(hex1, hex2) {
  const toRgb = (h) => {
    h = (h || "").replace("#", "");
    if (h.length !== 6) return [0, 0, 0];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  };
  const relLuminance = ([r, g, b]) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [r, g, b].map(f);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const L1 = relLuminance(toRgb(hex1));
  const L2 = relLuminance(toRgb(hex2));
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}


// ═══════════════════════════════════════════════════════════════
//  SESSION PEAKS
//  Tracks the highest value seen per sid since launch and surfaces
//  it via the row's existing hover sub-tip (see SUB TOOLTIP above) —
//  no new chrome, just more info in a place people already hover.
// ═══════════════════════════════════════════════════════════════
function _trackPeak(sid, val) {
  if (typeof val !== "number" || isNaN(val)) return;
  if (sessionPeaks[sid] === undefined || val > sessionPeaks[sid]) {
    sessionPeaks[sid] = val;
  }
}

function _fmtPeak(val, unit) {
  if (typeof val !== "number" || isNaN(val)) return null;
  const numStr = fmt1(val, unit);
  const tight = unit === "°C" || unit === "%" || !unit; // no space before these
  return `peak ${numStr}${tight ? "" : " "}${unit || ""}`;
}

// Writes a row's hover tooltip as [extra] · [peak], skipping either part
// when absent. rowEl is looked up by sid since a row renders as either
// an "sr-" (dot/value) element or a "bar-" (fill bar) element depending
// on its current display style, never both.
function _updatePeakTip(sid, unit, extra) {
  const peakStr = _fmtPeak(sessionPeaks[sid], unit);
  const parts = [];
  if (extra && extra !== "--") parts.push(extra);
  if (peakStr) parts.push(peakStr);
  const rowEl =
    document.getElementById("sr-" + sid) ||
    document.getElementById("bar-" + sid);
  if (rowEl) rowEl.dataset.sub = parts.length ? parts.join(" · ") : "--";
}


// ═══════════════════════════════════════════════════════════════
//  DOTS
// ═══════════════════════════════════════════════════════════════
function makeDots(level, mode = "warn") {
  let html = '<span class="dots">';
  for (let i = 0; i < 5; i++) {
    const on = i < level;
    const bg = !on
      ? mode === "warn"
        ? "var(--dot-off-warn)"
        : "var(--dot-off-meter)"
      : mode === "warn"
        ? `var(--w${i + 1})`
        : "var(--meter)";
    html += `<span class="dpip" style="background:${bg}"></span>`;
  }
  return html + "</span>";
}


// ═══════════════════════════════════════════════════════════════
//  DATA HELPERS
// ═══════════════════════════════════════════════════════════════
function getLatest(dev) {
  const sh = dev?.status_history;
  return sh?.length ? sh[sh.length - 1] : null;
}
function getSlotValue(devices, slot) {
  const dev = devices.find((d) => d.uid === slot.uid);
  const lat = getLatest(dev);
  if (!lat) return undefined;
  if (slot.kind === "temp")
    return lat.temps?.find((t) => t.name === slot.name)?.temp;
  const ch = lat.channels?.find((c) => c.name === slot.name);
  if (!ch) return undefined;
  return slot.field ? ch[slot.field] : (ch.rpm ?? ch.duty ?? ch.watts);
}
function getFanDuty(devices, slot) {
  if (slot.kind !== "channel") return undefined;
  const dev = devices.find((d) => d.uid === slot.uid);
  return getLatest(dev)?.channels?.find((c) => c.name === slot.name)?.duty;
}

// ── Chassis fan average — the custom rows a user adds to the Chassis
// card that are assigned to an rpm-type sensor are treated as "case
// fans"; case_fan_avg (see CARD_DEFS) plots the mean of their duty%.
function _chassisFanRows() {
  return customRowsFor("case").filter(
    (r) => cfg.slots[r.sid]?.field === "rpm",
  );
}
function _chassisFanAvg(devices) {
  const duties = _chassisFanRows()
    .map((r) => getFanDuty(devices, cfg.slots[r.sid]))
    .filter((d) => d !== undefined);
  if (!duties.length) return undefined;
  return duties.reduce((a, b) => a + b, 0) / duties.length;
}

function buildLeaves(devices) {
  const out = [];
  for (const dev of devices) {
    const meta = deviceMeta[dev.uid];
    if (meta?.disabled) continue; // respect CC's own device-disable flag
    const lat = getLatest(dev);
    if (!lat) continue;
    // Prefer CC's real device name (from /devices); dev.type is only ever
    // set on the synthetic Linux device — dev.d_type is the actual field
    // name for real CC devices (e.g. "Liquidctl", "CPU").
    const dLbl =
      meta?.name || `${dev.d_type ?? dev.type ?? "Device"} ${dev.type_index ?? ""}`.trim();

    for (const t of lat.temps ?? []) {
      const sensorName = meta?.temps?.[t.name] || t.name;
      out.push({
        uid: dev.uid,
        kind: "temp",
        name: t.name,
        sensorName,
        field: null,
        value: t.temp,
        unit: "°C",
        dLbl,
        label: `${dLbl} → ${sensorName}`,
      });
    }
    for (const ch of lat.channels ?? []) {
      const sensorName = meta?.channels?.[ch.name] || ch.name;
      if (ch.rpm !== undefined)
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          sensorName,
          field: "rpm",
          value: ch.rpm,
          unit: "RPM",
          dLbl,
          label: `${dLbl} → ${sensorName} (RPM)`,
        });
      if (ch.duty !== undefined)
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          sensorName,
          field: "duty",
          value: ch.duty,
          unit: "%",
          dLbl,
          label: `${dLbl} → ${sensorName} (Duty)`,
        });
      if (ch.watts !== undefined) {
        const isFolder = ch.name?.startsWith("Folder ");
        const isNetRate = ch.name === "RX KB/s" || ch.name === "TX KB/s";
        const unit = isFolder ? "GB" : isNetRate ? "KB/s" : "W";
        const fieldTag = isFolder ? "(GB)" : isNetRate ? "(KB/s)" : "(Watts)";
        // Folder/net rows are synthetic (Linux side) — no CC label to
        // look up, so display the constructed name as-is.
        const dispName = isFolder || isNetRate ? ch.name : sensorName;
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          sensorName: dispName,
          field: "watts",
          value: ch.watts,
          unit,
          dLbl,
          label: `${dLbl} → ${dispName} ${fieldTag}`,
        });
      }
    }
  }
  return out;
}
const leafKey = (l) => `${l.uid}|${l.kind}|${l.name}|${l.field ?? ""}`;
const slotKey = (s) => `${s.uid}|${s.kind}|${s.name}|${s.field ?? ""}`;
const shortLabel = (lbl) => (lbl ? lbl.split("→").pop().trim() : "");

// ═══════════════════════════════════════════════════════════════
//  EDIT MODE
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  EDIT MODE
// ═══════════════════════════════════════════════════════════════
const _ICON_PENCIL = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5l1.5 1.5-7 7L1 11l1-2.5 7-7z"/><line x1="8" y1="2.5" x2="9.5" y2="4"/></svg>`;
const _ICON_CHECK = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>`;
// Chevron points the way the card will move: up = "click to collapse"
// (expanded now), down = "click to expand" (collapsed now).
const _ICON_CHEVRON_UP = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,7.5 6,4 9.5,7.5"/></svg>`;
const _ICON_CHEVRON_DOWN = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,4.5 6,8 9.5,4.5"/></svg>`;
// Bulk collapse/expand-all button — same up/down language, doubled.
const _ICON_CHEVRON_ALL_UP = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,5 6,2 10,5"/><polyline points="2,9.5 6,6.5 10,9.5"/></svg>`;
const _ICON_CHEVRON_ALL_DOWN = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,2.5 6,5.5 10,2.5"/><polyline points="2,7 6,10 10,7"/></svg>`;
function setEditMode(on) {
  editMode = on;
  const btn = document.getElementById("bb-cfg");
  if (btn) {
    btn.innerHTML = on ? _ICON_CHECK : _ICON_PENCIL;
    btn.classList.toggle("on", on);
  }
  document.getElementById("cards")?.classList.toggle("editing", on);
  if (!on) {
    closePicker();
    saveCfg();
  }
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

