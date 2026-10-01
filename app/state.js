/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — state.js
   Global config/state, the sensor slot & warning-threshold model, generic
   utilities, and the settings-drawer/edit-mode toggles. Platform-agnostic:
   it only knows the generic devices/channels shape, never where data came from.
   Depends on: themes.js (load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  SLOTS & THRESHOLDS
// ═══════════════════════════════════════════════════════════════
const SLOTS = [
  { id: "cpu_temp", lbl: "CPU Temp", cls: "cpu", unit: "°C" },
  { id: "cpu_load", lbl: "CPU Load", cls: "cpu", unit: "%" },
  { id: "cpu_fan", lbl: "CPU Fan", cls: "cpu", unit: "RPM" },

  { id: "gpu_temp", lbl: "GPU Temp", cls: "gpu", unit: "°C" },
  { id: "gpu_load", lbl: "GPU Load", cls: "gpu", unit: "%" },
  { id: "gpu_fan", lbl: "GPU Fan", cls: "gpu", unit: "RPM" },

  { id: "lnx_ram_pct", lbl: "RAM %", cls: "ram", unit: "%" },
  { id: "lnx_ram_used", lbl: "RAM Used GB", cls: "ram", unit: "GB" },
  { id: "lnx_ram_total", lbl: "RAM Total GB", cls: "ram", unit: "GB" },
  { id: "lnx_swap_pct", lbl: "Swap %", cls: "ram", unit: "%" },
  { id: "lnx_swap_used", lbl: "Swap Used GB", cls: "ram", unit: "GB" },
  { id: "lnx_swap_tot", lbl: "Swap Total GB", cls: "ram", unit: "GB" },

  { id: "lnx_net_rx", lbl: "Net RX KB/s", cls: "net", unit: "KB/s" },
  { id: "lnx_net_tx", lbl: "Net TX KB/s", cls: "net", unit: "KB/s" },

  { id: "case_temp", lbl: "Case Ambient", cls: "fan", unit: "°C" },
];

// Warn-level modes:
//   "absolute" — value compared to fixed thresholds (real throttle points, 0–100% rows)
//   "relative" — rise above a rolling baseline (ambient temps have no fixed safe number)
const PCT_LEVELS = [0, 25, 50, 75, 100];

const WARN_T = {
  cpu_temp: { mode: "absolute", levels: [35, 55, 72, 82, 92] },
  cpu_load: { mode: "absolute", levels: PCT_LEVELS },
  gpu_temp: { mode: "absolute", levels: [35, 55, 72, 82, 92] },
  gpu_load: { mode: "absolute", levels: PCT_LEVELS },
  lnx_ram_pct: { mode: "absolute", levels: PCT_LEVELS },
  lnx_swap_pct: { mode: "absolute", levels: PCT_LEVELS },
  case_temp: { mode: "relative", levels: [3, 6, 10, 14, 18] },
};

const BASELINE_WINDOW_MS = 30 * 60 * 1000;
const _baselineHist = {}; // sid -> [{t, v}, …] oldest-first

// Rolling 30-min minimum — the "normal" that relative levels measure a rise from.
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

// Counts how many thresholds `n` has reached (levels are ascending).
function _levelsReached(levels, n) {
  let lvl = 0;
  for (const t of levels) {
    if (n >= t) lvl++;
    else break;
  }
  return lvl;
}

// 0–5 severity for a reading. Sensors without a WARN_T entry get a neutral 2.
function warnLevel(slotId, val) {
  const spec = WARN_T[slotId];
  if (!spec) return 2;
  if (typeof val !== "number" || isNaN(val)) return 0;
  if (spec.mode === "relative") {
    const delta = val - _relBaseline(slotId, val);
    return Math.max(1, _levelsReached(spec.levels, delta));
  }
  return _levelsReached(spec.levels, val);
}

function dutyLevel(duty) {
  if (typeof duty !== "number") return 0;
  return Math.min(5, Math.ceil(duty / 20));
}


// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════
// Optional build-time overrides for the connection settings.
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
let phase = "setup"; // setup → connecting → dashboard
let _connectTime = 0; // epoch ms when the connection first went live

// Device sources; liveDevices is their concatenation (see refreshDevices()).
let ccDevices = [];
let linuxDevices = [];
let liveDevices = [];
let linuxAutoAssigned = false;
let sseAbort = null;

let editMode = false;
let drawerOpen = false; // moves in lockstep with editMode via the gear button
let pinned = false;
let locked = false;

let sparks = {}; // cardId -> MultiSpark
let sessionPeaks = {}; // sid -> highest value since launch (shown in the hover sub-tip)

// CoolerControl friendly names, fetched once per connection (fetchDeviceMeta()).
// uid -> { name, disabled, temps: {key: label}, channels: {key: label} }
let deviceMeta = {};

// Demo Mode (see app-modes.js) and theme cycling.
let demoMode = false;
let demoTimer = null;
let demoCurves = null;
let demoScenario = "normal"; // synced from cfg.demoScenario after loadCfg()
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
const _clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Bare path → short row label ("/" → "root", "/mnt/data" → "data").
const pathLabel = (p) => (p === "/" ? "root" : p.split("/").pop() || p);

// Value formatting
const fmt1 = (v, u) =>
  typeof v !== "number"
    ? "--"
    : u === "°C" || u === "KB/s"
      ? v.toFixed(1)
      : u === "GB"
        ? v.toFixed(2)
        : Math.round(v).toString();

function fmtGB(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "--";
  return v < 100 ? v.toFixed(1) : Math.round(v).toString();
}

function barText(used, total) {
  if (typeof used !== "number" || typeof total !== "number") return "--";
  return `${fmtGB(used)}/${fmtGB(total)} GB`;
}

function clampPct(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return _clamp(v, 0, 100);
}

// Bar fill colour: the card's own colour until usage gets worrying.
function barColorForPct(pct, baseColor) {
  if (typeof pct !== "number" || Number.isNaN(pct)) return baseColor;
  if (pct >= 90) return cssVar("--w5");
  if (pct >= 80) return cssVar("--w4");
  if (pct >= 60) return cssVar("--w3");
  return baseColor;
}

// Elapsed span (ms) for the sparkline's time-horizon label ("48s", "2m").
// Null until there's enough history to be worth showing.
function _fmtSpan(ms) {
  if (typeof ms !== "number" || ms < 4000) return null;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

// Colour helpers
function hexToRgb(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}

function withAlpha(color, a) {
  color = (color || "").trim();
  if (color.startsWith("#") && color.length === 7) {
    const [r, g, b] = hexToRgb(color);
    return `rgba(${r},${g},${b},${a})`;
  }
  if (color.startsWith("rgba("))
    return color.replace(/,\s*[\d.]+\s*\)$/, `,${a})`);
  if (color.startsWith("rgb("))
    return color.replace("rgb(", "rgba(").replace(")", `,${a})`);
  return `rgba(128,128,128,${a})`;
}

// WCAG 2.x contrast ratio between two #rrggbb colours: 1 (none) to 21.
function wcagContrast(hex1, hex2) {
  const relLuminance = ([r, g, b]) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [r, g, b].map(f);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const L1 = relLuminance(hexToRgb(hex1) ?? [0, 0, 0]);
  const L2 = relLuminance(hexToRgb(hex2) ?? [0, 0, 0]);
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}

// In-app replacement for prompt(), styled to match the drawer. Resolves to
// the entered string, or null if cancelled. `validate(value)` may return an
// error string to keep the modal open, or a falsy value to accept.
function showTextPrompt({
  title = "",
  label = "",
  defaultValue = "",
  placeholder = "",
  validate = null,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("text-modal");
    const titleEl = document.getElementById("text-modal-title");
    const labelEl = document.getElementById("text-modal-label");
    const input = document.getElementById("text-modal-input");
    const errorEl = document.getElementById("text-modal-error");
    const okBtn = document.getElementById("text-modal-ok");
    const cancelBtn = document.getElementById("text-modal-cancel");

    titleEl.textContent = title;
    labelEl.textContent = label;
    input.value = defaultValue;
    input.placeholder = placeholder;
    errorEl.hidden = true;
    errorEl.textContent = "";

    const cleanup = () => {
      overlay.classList.add("hide");
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
      input.onkeydown = null;
    };

    const submit = () => {
      const value = input.value;
      const err = validate?.(value);
      if (err) {
        errorEl.textContent = err;
        errorEl.hidden = false;
        return;
      }
      cleanup();
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    okBtn.onclick = submit;
    cancelBtn.onclick = cancel;
    overlay.onclick = (e) => {
      if (e.target === overlay) cancel();
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") cancel();
    };

    overlay.classList.remove("hide");
    input.focus();
    input.select();
  });
}

// Closes the picker and refits the window.
function showScreen() {
  closePicker();
  requestAnimationFrame(() => autoResize());
}


// ═══════════════════════════════════════════════════════════════
//  ICONS
// ═══════════════════════════════════════════════════════════════
const _svgIcon = (strokeWidth, inner) =>
  `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// Chevron points the way the card will move: up = "click to collapse".
const _ICON_CHEVRON_UP = _svgIcon(1.75, `<polyline points="2.5,7.5 6,4 9.5,7.5"/>`);
const _ICON_CHEVRON_DOWN = _svgIcon(1.75, `<polyline points="2.5,4.5 6,8 9.5,4.5"/>`);
// Collapse/expand-all: the same chevrons, doubled.
const _ICON_CHEVRON_ALL_UP = _svgIcon(1.5, `<polyline points="2,5 6,2 10,5"/><polyline points="2,9.5 6,6.5 10,9.5"/>`);
const _ICON_CHEVRON_ALL_DOWN = _svgIcon(1.5, `<polyline points="2,2.5 6,5.5 10,2.5"/><polyline points="2,7 6,10 10,7"/>`);
// Token visibility: _ICON_EYE = masked (click to reveal), _ICON_EYE_OFF = revealed.
const _EYE_PATH = `<path d="M1 6c1.4-2.6 3.2-3.9 5-3.9s3.6 1.3 5 3.9c-1.4 2.6-3.2 3.9-5 3.9S2.4 8.6 1 6z"/><circle cx="6" cy="6" r="1.4"/>`;
const _ICON_EYE = _svgIcon(1.3, _EYE_PATH);
const _ICON_EYE_OFF = _svgIcon(1.3, _EYE_PATH + `<line x1="1.3" y1="1.3" x2="10.7" y2="10.7"/>`);
// Six-dot drag grip, shared by card and row reordering.
const _ICON_GRIP = `<svg viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg>`;


// ═══════════════════════════════════════════════════════════════
//  SESSION PEAKS
//  Highest value per sid since launch, surfaced in the row's hover sub-tip.
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

// Sets a row's hover tooltip to "[extra] · [peak]", skipping absent parts.
// A row renders as either an "sr-" (dot/value) or "bar-" (fill bar) element.
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
// Five-pip readout. mode "warn" colours lit pips along --w1…--w5;
// "meter" lights them in one neutral --meter colour.
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

// Duty % for a fan row (drives the meter dots and FAN AVG). Explicit user
// choices beat auto-detection, in this order:
//   1. slot.pairedDuty    — a duty channel the user picked. Motherboard/hwmon
//                           headers often report rpm and duty as unrelated
//                           channels with no reliable naming pattern, so the
//                           picker asks on every RPM assignment.
//   2. slot.manualMaxRpm  — spec-sheet ceiling; duty = rpm / max × 100.
//   3. native duty on the same channel object.
// With none of these, fanDotLevel() falls back to an RPM-relative estimate.
function getFanDuty(devices, slot) {
  if (slot.kind !== "channel") return undefined;

  if (slot.pairedDuty) {
    const dev = devices.find((d) => d.uid === slot.pairedDuty.uid);
    const ch = getLatest(dev)?.channels?.find(
      (c) => c.name === slot.pairedDuty.name,
    );
    if (ch?.duty !== undefined) return ch.duty;
  }

  if (typeof slot.manualMaxRpm === "number" && slot.manualMaxRpm > 0) {
    const rpm = getSlotValue(devices, slot);
    if (typeof rpm === "number") return _clamp((rpm / slot.manualMaxRpm) * 100, 0, 100);
  }

  const dev = devices.find((d) => d.uid === slot.uid);
  return getLatest(dev)?.channels?.find((c) => c.name === slot.name)?.duty;
}

// Meter-dot level for a fan row: real duty% when known, otherwise RPM
// relative to the highest RPM seen this session (sessionPeaks is already
// tracked per row by _trackPeak()).
function fanDotLevel(v, duty, sid) {
  if (typeof duty === "number") return dutyLevel(duty);
  if (typeof v !== "number" || isNaN(v) || v <= 0) return 0;
  const peak = Math.max(sessionPeaks[sid] ?? 0, v);
  return Math.min(5, Math.max(1, Math.ceil((v / peak) * 5)));
}

// Custom rows on the Chassis card assigned to an rpm sensor count as "case
// fans"; the case_fan_avg row (see CARD_DEFS) plots the mean of their duty%.
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

// Linux disk usage channels are named "Disk <mount> Usage". Returns
// [{ ch, mount }] for each, skipping user-hidden mounts unless asked not to.
function diskChannels(lat, { includeHidden = false } = {}) {
  const hidden = cfg.hiddenMounts ?? [];
  const out = [];
  for (const ch of lat?.channels ?? []) {
    const m = /^Disk (.+) Usage$/.exec(ch.name);
    if (!m) continue;
    if (!includeHidden && hidden.includes(m[1])) continue;
    out.push({ ch, mount: m[1] });
  }
  return out;
}
// DOM id stem for a disk's bar row.
const diskSid = (mount) => "ad-" + mount.replace(/[^a-zA-Z0-9]/g, "_");

// Flattens devices into assignable sensors ("leaves") for the picker.
function buildLeaves(devices) {
  const out = [];
  for (const dev of devices) {
    const meta = deviceMeta[dev.uid];
    if (meta?.disabled) continue; // respect CC's own device-disable flag
    const lat = getLatest(dev);
    if (!lat) continue;
    // dev.type exists only on the synthetic Linux device; real CC devices
    // carry dev.d_type (e.g. "Liquidctl", "CPU").
    const dLbl =
      meta?.name || `${dev.d_type ?? dev.type ?? "Device"} ${dev.type_index ?? ""}`.trim();

    const leaf = (kind, name, sensorName, field, value, unit, tag) => ({
      uid: dev.uid,
      kind,
      name,
      sensorName,
      field,
      value,
      unit,
      dLbl,
      label: `${dLbl} → ${sensorName}${tag ? " " + tag : ""}`,
    });

    for (const t of lat.temps ?? []) {
      const sensorName = meta?.temps?.[t.name] || t.name;
      out.push(leaf("temp", t.name, sensorName, null, t.temp, "°C"));
    }
    for (const ch of lat.channels ?? []) {
      const sensorName = meta?.channels?.[ch.name] || ch.name;
      if (ch.rpm !== undefined)
        out.push(leaf("channel", ch.name, sensorName, "rpm", ch.rpm, "RPM", "(RPM)"));
      if (ch.duty !== undefined)
        out.push(leaf("channel", ch.name, sensorName, "duty", ch.duty, "%", "(Duty)"));
      if (ch.watts !== undefined) {
        // "watts" is a generic numeric carrier: real watts from CC, but GB
        // (folders) and KB/s (network) for the synthetic Linux channels.
        const isFolder = ch.name?.startsWith("Folder ");
        const isNetRate = ch.name === "RX KB/s" || ch.name === "TX KB/s";
        const unit = isFolder ? "GB" : isNetRate ? "KB/s" : "W";
        const tag = isFolder ? "(GB)" : isNetRate ? "(KB/s)" : "(Watts)";
        // Synthetic rows have no CC label to look up; show the name as-is.
        const dispName = isFolder || isNetRate ? ch.name : sensorName;
        out.push(leaf("channel", ch.name, dispName, "watts", ch.watts, unit, tag));
      }
    }
  }
  return out;
}
const leafKey = (l) => `${l.uid}|${l.kind}|${l.name}|${l.field ?? ""}`;
const slotKey = (s) => `${s.uid}|${s.kind}|${s.name}|${s.field ?? ""}`;
const shortLabel = (lbl) => (lbl ? lbl.split("→").pop().trim() : "");


// ═══════════════════════════════════════════════════════════════
//  EDIT MODE & SETTINGS DRAWER
// ═══════════════════════════════════════════════════════════════
// Gear-button and #cards styling follow editMode.
function _syncEditChrome() {
  document.getElementById("bb-cfg")?.classList.toggle("on", editMode);
  document.getElementById("cards")?.classList.toggle("editing", editMode);
}

function setEditMode(on) {
  editMode = on;
  _syncEditChrome();
  if (!on) {
    closePicker();
    saveCfg();
  }
  rebuildDashboard();
}

const _drawer = document.getElementById("drawer");
let _themeScreenInited = false;

// One gear button drives editMode and the settings drawer together.
function setConfigOpen(open) {
  drawerOpen = open;
  setEditMode(open);
  _drawer.classList.toggle("open", open);
  if (open) {
    if (!_themeScreenInited) {
      initThemeScreen();
      _themeScreenInited = true;
    } else {
      // Config may have changed since the drawer last opened.
      document.getElementById("tc-url").value = cfg.baseUrl;
      document.getElementById("tc-tok").value = cfg.token;
    }
    _updateDemoButtons();
  }
  requestAnimationFrame(() => autoResize());
}

document.getElementById("bb-cfg").onclick = () => setConfigOpen(!drawerOpen);
document.getElementById("bb-mini-all").onclick = () => {
  if (!editMode) toggleAllCardsMini();
};
document.getElementById("bb-lock").onclick = () => {
  locked = !locked;
  document.getElementById("bb-lock").classList.toggle("on", locked);
  document.getElementById("app").classList.toggle("locked", locked);
};
