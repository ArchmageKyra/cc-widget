/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — monitor.js
   ────────────────────────────────────────────────────────────────────────────
   Main application — sizes, config, data fetching, card building,
   dashboard rendering, theme screen, setup screen.
   Depends on: themes.js (must be loaded first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  SIZES
// ═══════════════════════════════════════════════════════════════
const SIZES = {
  s: {
    label: "S",
    vars: {
      "--sz-lbl": "11px",
      "--sz-val": "16px",
      "--sz-unit": "10px",
      "--sz-hdr": "12px",
      "--sz-meta": "11px",
      "--sz-pct": "16px",
      "--sz-dot": "8px",
      "--sz-track": "7px",
      "--pad-card": "10px",
      "--pad-row": "3px",
      "--canvas-w": "162px",
      "--canvas-h": "92px",
      "--canvas-lh": "62px",
      "--dash-w": "440px",
    },
    width: 440,
    canvas: { w: 162, h: 92 },
    canvasL: { w: 397, h: 62 },
  },
  m: {
    label: "M",
    vars: {
      "--sz-lbl": "12.5px",
      "--sz-val": "19px",
      "--sz-unit": "11px",
      "--sz-hdr": "13.5px",
      "--sz-meta": "12px",
      "--sz-pct": "19px",
      "--sz-dot": "9px",
      "--sz-track": "8px",
      "--pad-card": "12px",
      "--pad-row": "4px",
      "--canvas-w": "180px",
      "--canvas-h": "108px",
      "--canvas-lh": "72px",
      "--dash-w": "500px",
    },
    width: 500,
    canvas: { w: 180, h: 108 },
    canvasL: { w: 451, h: 72 },
  },
  l: {
    label: "L",
    vars: {
      "--sz-lbl": "14px",
      "--sz-val": "22px",
      "--sz-unit": "12px",
      "--sz-hdr": "15px",
      "--sz-meta": "13px",
      "--sz-pct": "22px",
      "--sz-dot": "10px",
      "--sz-track": "9px",
      "--pad-card": "14px",
      "--pad-row": "5px",
      "--canvas-w": "204px",
      "--canvas-h": "124px",
      "--canvas-lh": "84px",
      "--dash-w": "580px",
    },
    width: 580,
    canvas: { w: 204, h: 124 },
    canvasL: { w: 528, h: 84 },
  },
};

// All var keys managed by size
const SIZE_VAR_KEYS = Object.keys(SIZES.m.vars);

function applySize(key, rebuild = true) {
  const sz = SIZES[key] || SIZES.s;
  const root = document.documentElement;
  SIZE_VAR_KEYS.forEach((v) => root.style.removeProperty(v));
  Object.entries(sz.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  cfg.size = key;
  saveCfg();
  document
    .querySelectorAll(".size-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.size === key));
  if (rebuild && phase === "dashboard") {
    buildCards();
    renderDashboard(liveDevices);
  }
}

// Helper: current canvas dimensions from active size preset
function canvasDims() {
  const sz = SIZES[cfg.size] || SIZES.s;
  return { spark: sz.canvas, longSpark: sz.canvasL };
}

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
    lbl: "Net RX MB/s",
    cls: "net",
    unit: "MB/s",
  },
  {
    id: "lnx_net_tx",
    lbl: "Net TX MB/s",
    cls: "net",
    unit: "MB/s",
  },

  {
    id: "case_temp",
    lbl: "Case Ambient",
    cls: "fan",
    unit: "°C",
  },
];

const WARN_T = {
  cpu_temp: [35, 55, 72, 82, 92],
  cpu_load: [0, 25, 50, 75, 100],
  gpu_temp: [35, 55, 72, 82, 92],
  gpu_load: [0, 25, 50, 75, 100],
  ram_temp: [30, 42, 50, 58, 65],
  ssd_temp: [25, 40, 55, 65, 75],
  case_temp: [20, 32, 38, 45, 55],
  lnx_ram_pct: [0, 25, 50, 75, 100],
  lnx_swap_pct: [0, 25, 50, 75, 100],
};

function warnLevel(slotId, val) {
  const t = WARN_T[slotId];
  if (!t) return 2;
  let lvl = 0;
  for (const thresh of t) {
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
  theme: "deep-space",
  customThemeCSS: "",
  size: "s",
  hiddenMounts: [],
  fanLabels: {},
  rowStyles: {},
  customRows: {},
  rowOrder: {},
  showPeakMarkers: true,
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
//  ROW STYLE — user-selectable display per row
//  Options:  "bar"        — fill bar + percentage
//            "dots-warn"  — colour dot ramp (green → red)
//            "dots-meter" — muted dot ramp (neutral intensity)
//  Rows with pctSid can use all three; others only the two dot modes.
// ═══════════════════════════════════════════════════════════════
function getRowStyle(row) {
  const saved = cfg.rowStyles?.[row.sid];
  if (saved) {
    if (saved === "bar" && !row.pctSid) {
      /* bar invalid without pctSid — fall through */
    } else return saved;
  }
  if (row.pctSid) return "bar";
  if (row.mode === "meter") return "dots-meter";
  if (row.mode) return "dots-warn";
  return "num-only"; // rows with no mode/pctSid are implicitly num-only
}

function cycleRowStyle(row) {
  const options = row.pctSid
    ? ["bar", "dots-warn", "dots-meter", "num-only"]
    : row.mode
      ? ["dots-warn", "dots-meter", "num-only"]
      : [];
  if (!options.length) return;
  const current = getRowStyle(row);
  const next = options[(options.indexOf(current) + 1) % options.length];
  cfg.rowStyles ??= {};
  cfg.rowStyles[row.sid] = next;
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// ═══════════════════════════════════════════════════════════════
//  ROW MENU — small floating "⋯" menu used by custom rows to fit
//  rename/style/reassign/move/remove without crowding the row with
//  five separate buttons. Single shared instance, positioned from
//  the trigger button's rect (cards have overflow:hidden, so an
//  absolutely-positioned dropdown nested inside one would clip).
// ═══════════════════════════════════════════════════════════════
let _rowMenuEl = null;

function _closeRowMenu() {
  if (!_rowMenuEl) return;
  _rowMenuEl.remove();
  _rowMenuEl = null;
  document.removeEventListener("click", _rowMenuOutsideClick, true);
}

function _rowMenuOutsideClick(e) {
  if (_rowMenuEl && !_rowMenuEl.contains(e.target)) _closeRowMenu();
}

// items: [{ label, danger?, onClick }]
function _openRowMenu(anchorBtn, items) {
  _closeRowMenu();
  const menu = el("div", "row-menu");
  for (const it of items) {
    const b = el("button", "row-menu-item" + (it.danger ? " danger" : ""));
    b.textContent = it.label;
    b.onclick = (e) => {
      e.stopPropagation();
      _closeRowMenu();
      it.onClick();
    };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);

  const r = anchorBtn.getBoundingClientRect();
  let left = r.right - menu.offsetWidth;
  if (left < 4) left = 4;
  let top = r.bottom + 4;
  if (top + menu.offsetHeight > window.innerHeight - 4) {
    top = r.top - menu.offsetHeight - 4; // flip above if it'd overflow
  }
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  _rowMenuEl = menu;
  // deferred so the click that opened the menu doesn't immediately close it
  setTimeout(
    () => document.addEventListener("click", _rowMenuOutsideClick, true),
    0,
  );
}

// ═══════════════════════════════════════════════════════════════
//  SUB TOOLTIP — shows the "used / total GB" label on bar row
//  hover. Body-level so card overflow:hidden can't clip it.
// ═══════════════════════════════════════════════════════════════
let _subTipEl = null;
let _subTipTarget = null;

function _showSubTip(text, anchorEl) {
  if (!_subTipEl) {
    _subTipEl = el("div", "sub-tip");
    document.body.appendChild(_subTipEl);
  }
  _subTipEl.textContent = text;
  _subTipEl.style.display = "block";
  const r = anchorEl.getBoundingClientRect();
  // Position above the row, centred
  const tipW = _subTipEl.offsetWidth;
  let left = r.left + r.width / 2 - tipW / 2;
  if (left < 4) left = 4;
  if (left + tipW > window.innerWidth - 4) left = window.innerWidth - 4 - tipW;
  _subTipEl.style.left = left + "px";
  _subTipEl.style.top = r.top - _subTipEl.offsetHeight - 5 + "px";
}

function _hideSubTip() {
  if (_subTipEl) _subTipEl.style.display = "none";
  _subTipTarget = null;
}

// Delegated listeners on #app — lightweight, survives buildCards() rebuilds
document.getElementById("app").addEventListener("mouseover", (e) => {
  if (locked) return;
  const row = e.target.closest(".sr[data-sub]");
  if (!row || row === _subTipTarget) return;
  const sub = row.dataset.sub;
  if (sub && sub !== "--") {
    _subTipTarget = row;
    _showSubTip(sub, row);
  }
});
document.getElementById("app").addEventListener("mouseout", (e) => {
  const row = e.target.closest(".sr[data-sub]");
  if (row) _hideSubTip();
});
// a sensible title when reassigning a custom row's source (custom
// sids aren't in SLOTS, so the usual title lookup falls through).
function _customRowLabel(sid) {
  for (const rows of Object.values(cfg.customRows ?? {})) {
    const r = rows.find((x) => x.sid === sid);
    if (r) return r.lbl;
  }
  return null;
}

// Wires an "+ assign" / "✎" affordance onto a row element in edit
// mode. Top-level (not per-card) since it only touches globals —
// callable from buildCards()'s per-card loop and from
// _renderCustomRowSection() alike.
function _afford(elem, row) {
  if (!editMode || !row.typeFilter) return;
  elem.classList.add("assignable");
  const assigned = !!cfg.slots[row.sid];
  const badge = el("button", "assign-badge");
  badge.textContent = assigned ? "✎" : "+ assign";
  if (assigned) badge.classList.add("set");
  const open = () => openPicker(row.sid, row.typeFilter);
  badge.onclick = (e) => {
    e.stopPropagation();
    open();
  };
  elem.onclick = open;
  elem.appendChild(badge);
}

// Appends a style-cycle button to a row element when in edit mode.
// Call this before any assign/remap badge so the order reads naturally.
const _STYLE_LABELS = {
  bar: "▬",
  "dots-warn": "●●",
  "dots-meter": "○○",
  "num-only": "#",
};
function _styleToggle(elem, row) {
  if (!editMode) return;
  if (!row.pctSid && !row.mode) return; // no meaningful options
  const btn = el("button", "assign-badge style-tog");
  btn.textContent = _STYLE_LABELS[getRowStyle(row)] ?? "?";
  btn.title = "Toggle display style";
  btn.onclick = (e) => {
    e.stopPropagation();
    cycleRowStyle(row);
  };
  elem.appendChild(btn);
}

// ⋯ menu for hardcoded (non-custom) rows — consolidates style toggle +
// assign/remap into a single button, mirroring the custom-row row-more menu.
// isAutoLinux:true  → offers "Remap source" (shows all devices incl. Linux)
// otherwise         → offers "Assign / Change sensor" via typeFilter
function _hardRowMenu(elem, row, { isAutoLinux = false } = {}) {
  if (!editMode) return;
  elem.classList.add("assignable");
  const more = el("button", "assign-badge row-more");
  more.textContent = "⋯";
  more.title = "Row options";
  more.onclick = (e) => {
    e.stopPropagation();
    const items = [];
    // Style toggle (only when meaningful)
    if (row.pctSid || row.mode) {
      items.push({
        label: `Style: ${_STYLE_LABELS[getRowStyle(row)] ?? "?"}`,
        onClick: () => cycleRowStyle(row),
      });
    }
    // Sensor assign / remap
    if (isAutoLinux) {
      items.push({
        label: "Remap source…",
        onClick: () => openPicker(row.sid, null, true),
      });
    } else if (row.typeFilter) {
      const assigned = !!cfg.slots[row.sid];
      items.push({
        label: assigned ? "Change sensor…" : "+ Assign sensor",
        onClick: () => openPicker(row.sid, row.typeFilter),
      });
      if (assigned) {
        items.push({
          label: "Clear assignment",
          danger: true,
          onClick: () => {
            delete cfg.slots[row.sid];
            saveCfg();
            buildCards();
            renderDashboard(liveDevices);
            requestAnimationFrame(() => autoResize());
          },
        });
      }
    }
    if (items.length) _openRowMenu(more, items);
  };
  elem.appendChild(more);
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOM ROWS — user-added rows appended to one of the 6 fixed
//  cards. What gets *plotted* on a card's sparkline is fixed
//  (CARD_DEFS); custom rows are always noPlot — display-only
//  (dots/value), never feed the canvas. They reuse the exact same
//  cfg.slots / typeFilter / style machinery as built-in rows, just
//  with a generated sid and their own per-card display order.
// ═══════════════════════════════════════════════════════════════
const ALL_SENSOR_TYPES = ["temp", "rpm", "duty", "watts"];

function customRowsFor(cardId) {
  const list = cfg.customRows?.[cardId] ?? [];
  const order = cfg.rowOrder?.[cardId];
  if (!order) return list;
  const bySid = new Map(list.map((r) => [r.sid, r]));
  const out = [];
  for (const sid of order) {
    if (bySid.has(sid)) {
      out.push(bySid.get(sid));
      bySid.delete(sid);
    }
  }
  out.push(...bySid.values()); // rows not yet in the saved order (newly added)
  return out;
}

function addCustomRow(cardId, leaf) {
  const sid = `custom_${cardId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const row = {
    sid,
    lbl: shortLabel(leaf.label) || leaf.name,
    mode: "warn",
    noPlot: true,
    custom: true,
    typeFilter: ALL_SENSOR_TYPES,
  };
  cfg.customRows ??= {};
  (cfg.customRows[cardId] ??= []).push(row);
  cfg.rowOrder ??= {};
  (cfg.rowOrder[cardId] ??= []).push(sid);
  cfg.slots[sid] = { ...leaf };
}

function moveCustomRow(cardId, sid, dir) {
  const order = customRowsFor(cardId).map((r) => r.sid);
  const i = order.indexOf(sid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  cfg.rowOrder ??= {};
  cfg.rowOrder[cardId] = order;
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

function removeCustomRow(cardId, sid) {
  cfg.customRows[cardId] = (cfg.customRows[cardId] ?? []).filter(
    (r) => r.sid !== sid,
  );
  if (cfg.rowOrder?.[cardId])
    cfg.rowOrder[cardId] = cfg.rowOrder[cardId].filter((s) => s !== sid);
  delete cfg.slots[sid];
  if (cfg.rowStyles) delete cfg.rowStyles[sid];
  saveCfg();
  _sendFolderPaths();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// Renders a card's custom rows (in their saved order) plus the
// trailing "+ Add row" affordance. Shared by spark and sensor cards.
function _renderCustomRowSection(def, container) {
  const rows = customRowsFor(def.id);
  rows.forEach((row, idx) => {
    if (!cfg.slots[row.sid] && !editMode) return;
    const elem = _buildSrRow(row, withAlpha(cssVar("--txt-dim"), 0.45));
    if (editMode) {
      const more = el("button", "assign-badge row-more");
      more.textContent = "⋯";
      more.title = "Row options";
      more.onclick = (e) => {
        e.stopPropagation();
        const items = [
          {
            label: "Rename",
            onClick: () => {
              const nl = prompt("Label:", row.lbl);
              if (nl && nl.trim()) {
                row.lbl = nl.trim();
                saveCfg();
                buildCards();
                renderDashboard(liveDevices);
                requestAnimationFrame(() => autoResize());
              }
            },
          },
        ];
        // Style option only when dots or bar are meaningful
        if (row.pctSid || row.mode) {
          items.push({
            label: `Style: ${_STYLE_LABELS[getRowStyle(row)] ?? "?"}`,
            onClick: () => cycleRowStyle(row),
          });
        }
        // Folder rows get "Change path", sensor rows get "Change sensor"
        if (row.kind === "folder") {
          items.push({
            label: "Change path…",
            onClick: () => {
              const newPath = prompt("Folder path:", row.path);
              if (!newPath?.trim() || newPath.trim() === row.path) return;
              row.path = newPath.trim();
              cfg.slots[row.sid] = {
                ...cfg.slots[row.sid],
                name: `Folder ${row.path}`,
                label: `Folder: ${row.path}`,
              };
              saveCfg();
              _sendFolderPaths();
              buildCards();
              renderDashboard(liveDevices);
              requestAnimationFrame(() => autoResize());
            },
          });
        } else {
          items.push({
            label: "Change sensor…",
            onClick: () => openPicker(row.sid, ALL_SENSOR_TYPES, true),
          });
        }
        if (idx > 0)
          items.push({
            label: "Move up",
            onClick: () => moveCustomRow(def.id, row.sid, -1),
          });
        if (idx < rows.length - 1)
          items.push({
            label: "Move down",
            onClick: () => moveCustomRow(def.id, row.sid, 1),
          });
        items.push({
          label: "Remove row",
          danger: true,
          onClick: () => removeCustomRow(def.id, row.sid),
        });
        _openRowMenu(more, items);
      };
      elem.appendChild(more);
    }
    container.appendChild(elem);
  });

  if (editMode) {
    const addRow = el("div", "picker-add");
    addRow.textContent = "+ Add row";
    addRow.onclick = () => openPicker(null, null, true, def.id);
    container.appendChild(addRow);
  }
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
const fmt1 = (v, u) =>
  typeof v !== "number"
    ? "--"
    : u === "°C" || u === "MB/s"
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

function showScreen(id) {
  ["s-setup", "s-dash"].forEach((s) =>
    document.getElementById(s).classList.toggle("hide", s !== id),
  );
  // Always close picker when changing screens
  closePicker();
  // Re-measure whenever the dashboard becomes visible
  if (id === "s-dash") requestAnimationFrame(() => autoResize());
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
//  GTK BRIDGE
// ═══════════════════════════════════════════════════════════════
function gtksend(msg) {
  try {
    window.webkit.messageHandlers.ccm.postMessage(msg);
  } catch {}
}

document.getElementById("bb-x").onclick = () => gtksend("close");
document.getElementById("bb-min").onclick = () => gtksend("minimize");
document.getElementById("bb-pin").onclick = () => {
  pinned = !pinned;
  gtksend(pinned ? "pin" : "unpin");
  document.getElementById("bb-pin").classList.toggle("on", pinned);
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
  }
  requestAnimationFrame(() => autoResize());
}

document.getElementById("bb-cfg").onclick = () => {
  if (phase === "dashboard") setConfigOpen(!drawerOpen);
  else initSetup();
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
  if (stats.unavailable) return;

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
      name: "RX MB/s",
      watts: stats.net?.rx_mbps ?? 0,
    },
    {
      name: "TX MB/s",
      watts: stats.net?.tx_mbps ?? 0,
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
};

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

async function startSSE() {
  stopSSE();
  sseAbort = new AbortController();
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
    phase = "dashboard";
    // Check if any CC-assignable slots are already configured
    const hasCCSlots = CARD_DEFS.some((def) =>
      def.rows?.some((r) => !r.autoLinux && r.typeFilter && cfg.slots[r.sid]),
    );
    // Enter edit mode automatically on first-time setup
    editMode = !hasCCSlots;
    buildCards();
    _sendFolderPaths(); // Re-sync Python with any persisted folder rows
    showScreen("s-dash");
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
  document.getElementById("sdot").className = "sdot " + cls;
  document.getElementById("stxt").textContent =
    cls === "ok" ? "Live" : cls === "err" ? msg : msg || "…";
  if (cls === "ok") {
    if (!_connectTime) _connectTime = Date.now();
    const up = document.getElementById("sbar-uptime");
    if (up) up.textContent = _fmtUptime(Date.now() - _connectTime);
  }
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

function buildLeaves(devices) {
  const out = [];
  for (const dev of devices) {
    const lat = getLatest(dev),
      dLbl = `${dev.type} ${dev.type_index ?? ""}`.trim();
    if (!lat) continue;
    for (const t of lat.temps ?? [])
      out.push({
        uid: dev.uid,
        kind: "temp",
        name: t.name,
        field: null,
        value: t.temp,
        unit: "°C",
        dLbl,
        label: `${dLbl} → ${t.name}`,
      });
    for (const ch of lat.channels ?? []) {
      if (ch.rpm !== undefined)
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          field: "rpm",
          value: ch.rpm,
          unit: "RPM",
          dLbl,
          label: `${dLbl} → ${ch.name} (RPM)`,
        });
      if (ch.duty !== undefined)
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          field: "duty",
          value: ch.duty,
          unit: "%",
          dLbl,
          label: `${dLbl} → ${ch.name} (Duty)`,
        });
      if (ch.watts !== undefined) {
        const isFolder = ch.name?.startsWith("Folder ");
        out.push({
          uid: dev.uid,
          kind: "channel",
          name: ch.name,
          field: "watts",
          value: ch.watts,
          unit: isFolder ? "GB" : "W",
          dLbl,
          label: `${dLbl} → ${ch.name} ${isFolder ? "(GB)" : "(Watts)"}`,
        });
      }
    }
  }
  return out;
}
const leafKey = (l) => `${l.uid}|${l.kind}|${l.name}|${l.field ?? ""}`;
const slotKey = (s) => `${s.uid}|${s.kind}|${s.name}|${s.field ?? ""}`;
const shortLabel = (lbl) => (lbl ? lbl.split("→").pop().trim() : "");

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
//  SETUP SCREEN
// ═══════════════════════════════════════════════════════════════
function initSetup() {
  phase = "setup";
  stopSSE();
  document.getElementById("i-url").value = cfg.baseUrl;
  document.getElementById("i-tok").value = cfg.token;
  const btn = document.getElementById("btn-connect");
  btn.textContent = "Connect";
  btn.disabled = false;
  _connectTime = 0;
  const _upEl = document.getElementById("sbar-uptime");
  if (_upEl) _upEl.textContent = "";
  showScreen("s-setup");
  btn.onclick = () => {
    document.getElementById("setup-err").classList.add("hide");
    cfg.baseUrl = document
      .getElementById("i-url")
      .value.trim()
      .replace(/\/$/, "");
    cfg.token = document.getElementById("i-tok").value.trim();
    if (!cfg.token) {
      showErr("Token required");
      return;
    }
    saveCfg();
    phase = "connecting";
    setStatus("spin", "Connecting…");
    btn.textContent = "Connecting…";
    btn.disabled = true;
    startSSE();
    // Note: Linux stats are pushed by Python automatically — no polling needed here
  };
}
function showErr(msg) {
  const e = document.getElementById("setup-err");
  e.textContent = msg;
  e.classList.remove("hide");
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

  // [slotId, channelName, field]
  const MAP = [
    ["cpu_load", "CPU Usage", "duty"],
    ["lnx_ram_pct", "RAM Usage", "duty"],
    ["lnx_ram_used", "RAM Used", "watts"],
    ["lnx_ram_total", "RAM Total", "watts"],
    ["lnx_swap_pct", "Swap Usage", "duty"],
    ["lnx_swap_used", "Swap Used", "watts"],
    ["lnx_swap_tot", "Swap Total", "watts"],
    ["lnx_net_rx", "RX MB/s", "watts"],
    ["lnx_net_tx", "TX MB/s", "watts"],
  ];

  let changed = false;
  for (const [slotId, chName, field] of MAP) {
    if (cfg.slots[slotId]) continue;
    const ch = lat.channels?.find((c) => c.name === chName);
    if (!ch) continue;
    cfg.slots[slotId] = {
      uid: "linux-system",
      kind: "channel",
      name: chName,
      field,
      unit: field === "duty" ? "%" : "W",
      dLbl: "Linux",
      label: `Linux → ${chName}`,
    };
    changed = true;
  }
  if (changed) saveCfg();
}

// ═══════════════════════════════════════════════════════════════
//  EDIT MODE
// ═══════════════════════════════════════════════════════════════
const _ICON_PENCIL = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5l1.5 1.5-7 7L1 11l1-2.5 7-7z"/><line x1="8" y1="2.5" x2="9.5" y2="4"/></svg>`;
const _ICON_CHECK = `<svg class="bb-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>`;
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

// ═══════════════════════════════════════════════════════════════
//  PICKER OVERLAY
//  openPicker(slotId, typeFilter, includeLinux, newRowCard)
//    slotId      — cfg.slots key to assign, null for new custom row
//    typeFilter  — array of field types: ["temp"], ["rpm"], etc.
//    includeLinux — show Linux device channels in the list
//    newRowCard  — card id → create a brand-new custom row on that
//                  card and assign the chosen sensor to it
// ═══════════════════════════════════════════════════════════════
function openPicker(
  slotId,
  typeFilter,
  includeLinux = false,
  newRowCard = null,
) {
  pickerCtx = { slotId, typeFilter, newRowCard };

  // Header title
  const slotMeta = SLOTS.find((s) => s.id === slotId);
  const titleEl = document.getElementById("picker-title");
  if (newRowCard) {
    const cardMeta = CARD_DEFS.find((d) => d.id === newRowCard);
    titleEl.textContent = "Add Row — " + (cardMeta?.lbl ?? newRowCard);
  } else {
    titleEl.textContent =
      "Assign " + (slotMeta?.lbl ?? _customRowLabel(slotId) ?? slotId ?? "");
  }

  const body = document.getElementById("picker-body");
  body.innerHTML = "";

  // Clear option for existing slot assignment
  if (!newRowCard && slotId && cfg.slots[slotId]) {
    const clr = el("div", "picker-clr");
    clr.innerHTML = `<span>× Clear assignment</span>`;
    clr.onclick = () => {
      delete cfg.slots[slotId];
      saveCfg();
      closePicker();
      buildCards();
      renderDashboard(liveDevices);
      requestAnimationFrame(() => autoResize());
    };
    body.appendChild(clr);
  }

  // Build filtered leaf list
  // includeLinux=true when remapping autoLinux rows — user can pick any source
  const leaves = buildLeaves(liveDevices).filter(
    (l) => includeLinux || l.uid !== "linux-system",
  );
  const filtered = typeFilter
    ? leaves.filter((l) => {
        if (l.kind === "temp" && typeFilter.includes("temp")) return true;
        if (l.kind === "channel" && typeFilter.includes(l.field)) return true;
        return false;
      })
    : leaves;

  // Group by device label
  const byDev = {};
  for (const leaf of filtered) {
    (byDev[leaf.dLbl] ??= []).push(leaf);
  }

  if (Object.keys(byDev).length === 0) {
    const emp = el("div", "picker-empty");
    emp.textContent = "No matching channels found";
    body.appendChild(emp);
  } else {
    const currentKey = newRowCard
      ? null
      : slotId && cfg.slots[slotId]
        ? slotKey(cfg.slots[slotId])
        : null;

    for (const [devLbl, devLeaves] of Object.entries(byDev)) {
      const sec = el("div", "picker-sec");
      sec.textContent = devLbl;
      body.appendChild(sec);

      for (const leaf of devLeaves) {
        const row = el("div", "picker-leaf");
        const lk = leafKey(leaf);
        if (lk === currentKey) row.classList.add("sel");

        row.innerHTML = `<span class="picker-leaf-name">${esc(leaf.name)}</span>
<span class="picker-leaf-val">${fmt1(leaf.value, leaf.unit)}</span>
<span class="picker-leaf-unit">${esc(leaf.unit)}</span>`;

        row.onclick = () => {
          if (newRowCard) {
            addCustomRow(newRowCard, leaf);
          } else {
            cfg.slots[slotId] = { ...leaf };
          }
          saveCfg();
          closePicker();
          buildCards();
          renderDashboard(liveDevices);
          requestAnimationFrame(() => autoResize());
        };
        body.appendChild(row);
      }
    }
  }

  // ── Folder size option — available for any custom row ──────────
  // Show when adding a new custom row or remapping an existing one.
  const isCustomCtx = newRowCard || slotId?.startsWith("custom_");
  if (isCustomCtx) {
    const folderSec = el("div", "picker-sec");
    folderSec.textContent = "Folder Size";
    body.appendChild(folderSec);

    const folderOpt = el("div", "picker-add");
    folderOpt.textContent = "+ Monitor folder path…";
    folderOpt.onclick = () => {
      const rawPath = prompt("Folder path to monitor:", "/home");
      if (!rawPath?.trim()) return;
      const path = rawPath.trim();
      const defaultLbl = path === "/" ? "root" : path.split("/").pop() || path;
      const rawLbl = prompt("Label:", defaultLbl);
      if (rawLbl === null) return; // user cancelled
      const lbl = rawLbl.trim() || defaultLbl;

      const slot = {
        uid: "linux-system",
        kind: "channel",
        name: `Folder ${path}`,
        field: "watts",
        unit: "GB",
        dLbl: "Linux",
        label: `Folder: ${path}`,
      };

      if (newRowCard) {
        // Creating a brand-new custom row
        const sid = `custom_${newRowCard}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const row = {
          sid,
          lbl,
          noPlot: true,
          custom: true,
          kind: "folder",
          path,
        };
        cfg.customRows ??= {};
        (cfg.customRows[newRowCard] ??= []).push(row);
        cfg.rowOrder ??= {};
        (cfg.rowOrder[newRowCard] ??= []).push(sid);
        cfg.slots[sid] = slot;
      } else {
        // Remapping an existing custom row
        cfg.slots[slotId] = slot;
        // Mark the row as a folder row and record its path
        for (const rows of Object.values(cfg.customRows ?? {})) {
          const r = rows.find((x) => x.sid === slotId);
          if (r) {
            r.kind = "folder";
            r.path = path;
            break;
          }
        }
      }

      saveCfg();
      closePicker();
      _sendFolderPaths();
      buildCards();
      renderDashboard(liveDevices);
      requestAnimationFrame(() => autoResize());
    };
    body.appendChild(folderOpt);
  }

  document.getElementById("picker").classList.remove("hide");
}

function closePicker() {
  pickerCtx = null;
  document.getElementById("picker")?.classList.add("hide");
}

document.getElementById("picker-close").onclick = () => closePicker();

// ═══════════════════════════════════════════════════════════════
//  THEME SCREEN
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  THEME BUILDER
//  Interactive color picker panel → generates :root { … } CSS
//  into the custom-css textarea, ready to Apply.
// ═══════════════════════════════════════════════════════════════
// Set by initThemeBuilder — exposed so theme-tile clicks (initThemeScreen)
// can resync the pickers, and so the "Custom…" tile can pull a CSS string
// without duplicating the generator.
let _tbSync = null;
let _tbGenerateCSS = null;

function initThemeBuilder() {
  if (document.getElementById("tb-toggle")._wired) return;
  document.getElementById("tb-toggle")._wired = true;

  const getCSSVar = (n) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const getRadius = () => parseInt(getCSSVar("--r") || "10", 10);

  const ACCENT_KEYS = ["--cpu", "--gpu", "--fan", "--ssd", "--ram", "--net"];
  const CHROME_KEYS = ["--bg", "--txt", "--txt-dim", "--txt-muted", "--hot"];
  const WARN_KEYS = ["--w1", "--w2", "--w3", "--w4", "--w5"];
  const SOLID_VARS = [...CHROME_KEYS, ...ACCENT_KEYS, ...WARN_KEYS];

  let bv = {
    "--bg": "#0d0d16",
    "--txt": "#e2e8f0",
    "--txt-dim": "#4b6080",
    "--txt-muted": "#1a2535",
    "--hot": "#f87171",
    "--cpu": "#60a5fa",
    "--gpu": "#34d399",
    "--fan": "#fb923c",
    "--ssd": "#818cf8",
    "--ram": "#a5b4fc",
    "--net": "#2dd4bf",
    "--w1": "#4ade80",
    "--w2": "#a3e635",
    "--w3": "#fbbf24",
    "--w4": "#f97316",
    "--w5": "#ef4444",
    "--r": 10,
  };

  // ── Sync bv from live CSS vars ─────────────────────────────
  function syncBuilderFromActive() {
    for (const k of SOLID_VARS) {
      const raw = getCSSVar(k);
      if (raw && raw.startsWith("#")) bv[k] = raw;
    }
    bv["--r"] = getRadius();
    syncUIFromBv();
  }

  // ── Push bv → all UI elements ──────────────────────────────
  function syncUIFromBv() {
    // Accent pills — background mirrors --bg so colour reads in context
    for (const v of ACCENT_KEYS) {
      const key = v.replace(/^--/, "");
      const pill = document.getElementById("tbs-" + key);
      if (pill) {
        pill.style.background = bv["--bg"];
        pill.style.borderColor = bv[v] + "44"; // accent border, faint
        const stripe = pill.querySelector(".tb-pill-stripe");
        if (stripe) stripe.style.background = bv[v];
        const lbl = pill.querySelector(".tb-pill-label");
        if (lbl) lbl.style.color = bv[v];
        const inp = pill.querySelector("input");
        if (inp) inp.value = bv[v];
      }
      const hx = document.getElementById("tbh-" + key);
      if (hx) hx.textContent = bv[v];
    }

    // Chrome swatches (bg, txt, txt-dim, hot)
    const CHROME_UI = ["--bg", "--txt", "--txt-dim", "--hot"];
    for (const v of CHROME_UI) {
      const key = v.replace(/^--/, "");
      const sw = document.getElementById("tbs-" + key);
      if (sw) {
        sw.style.background = bv[v];
        const inp = sw.querySelector("input");
        if (inp) inp.value = bv[v];
      }
      const hx = document.getElementById("tbh-" + key);
      if (hx) hx.textContent = bv[v];
    }

    // Warning pips
    for (let i = 1; i <= 5; i++) {
      const pip = document.getElementById("tbs-w" + i);
      if (pip) {
        pip.style.background = bv["--w" + i];
        const inp = pip.querySelector("input");
        if (inp) inp.value = bv["--w" + i];
      }
    }
    updateWarnGradient();

    // Radius
    const slider = document.getElementById("tb-radius");
    const rval = document.getElementById("tb-radius-val");
    if (slider) slider.value = bv["--r"];
    if (rval) rval.textContent = bv["--r"] + "px";

    updateContrastBadges();
  }

  // ── Live gradient bar for the warn ramp ───────────────────
  function updateWarnGradient() {
    const bar = document.getElementById("tb-warn-gradient");
    if (!bar) return;
    const stops = [1, 2, 3, 4, 5].map((i) => bv["--w" + i]).join(", ");
    bar.style.background = `linear-gradient(to right, ${stops})`;
  }

  // ── WCAG contrast checker — live ratio vs --bg for every text colour ──
  // AA body-text threshold is 4.5:1; AA large-text/UI threshold is 3:1.
  // ok = passes 4.5:1, warn = passes 3:1 only, bad = fails both.
  const CONTRAST_PAIRS = [
    ["--txt", "tbc-txt"],
    ["--txt-dim", "tbc-txt-dim"],
    ["--hot", "tbc-hot"],
  ];
  function updateContrastBadges() {
    for (const [fgVar, badgeId] of CONTRAST_PAIRS) {
      const badge = document.getElementById(badgeId);
      if (!badge) continue;
      const ratio = wcagContrast(bv[fgVar], bv["--bg"]);
      const grade = ratio >= 4.5 ? "ok" : ratio >= 3 ? "warn" : "bad";
      badge.textContent = ratio.toFixed(1) + ":1";
      badge.classList.remove("ok", "warn", "bad");
      badge.classList.add(grade);
      badge.title =
        grade === "ok"
          ? "Passes WCAG AA for body text (≥4.5:1)"
          : grade === "warn"
            ? "Passes WCAG AA for large text only (≥3:1) — risky for small labels"
            : "Fails WCAG AA — hard to read against this background";
    }
  }

  // ── Wire all color inputs ──────────────────────────────────
  document.querySelectorAll(".tb-body input[type=color]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const varName = e.target.dataset.var;
      bv[varName] = e.target.value;

      // Update the parent swatch / pip / pill
      const parent = e.target.closest(".tb-swatch,.tb-warn-pip,.tb-pill");
      if (parent) {
        if (parent.classList.contains("tb-pill")) {
          // Re-style the pill in full
          parent.style.background = bv["--bg"];
          parent.style.borderColor = e.target.value + "44";
          const stripe = parent.querySelector(".tb-pill-stripe");
          if (stripe) stripe.style.background = e.target.value;
          const lbl = parent.querySelector(".tb-pill-label");
          if (lbl) lbl.style.color = e.target.value;
        } else {
          parent.style.background = e.target.value;
        }
      }

      // Update hex readout
      const key = varName.replace(/^--/, "");
      const hx = document.getElementById("tbh-" + key);
      if (hx) hx.textContent = e.target.value;

      // When --bg changes, re-tint all pill backgrounds
      if (varName === "--bg") {
        for (const v of ACCENT_KEYS) {
          const k2 = v.replace(/^--/, "");
          const pill = document.getElementById("tbs-" + k2);
          if (pill) pill.style.background = e.target.value;
        }
      }

      // Warn ramp gradient
      if (varName.match(/--w[0-9]/)) updateWarnGradient();

      // Contrast badges — any of these four changes what's being measured
      if (["--bg", "--txt", "--txt-dim", "--hot"].includes(varName)) {
        updateContrastBadges();
      }

      liveApply();
    });
  });

  // ── Radius slider ──────────────────────────────────────────
  document.getElementById("tb-radius").addEventListener("input", (e) => {
    bv["--r"] = parseInt(e.target.value, 10);
    document.getElementById("tb-radius-val").textContent = bv["--r"] + "px";
    liveApply();
  });

  // ── Live apply — pickers write straight to the active theme, no
  //    separate Generate→Apply step. The textarea stays in sync as a
  //    secondary "paste your own" path for hand-editing.        ──
  function liveApply() {
    const css = generateCSS();
    document.getElementById("custom-css").value = css;
    applyTheme("custom", css);
    document
      .querySelectorAll(".theme-tile")
      .forEach((t) => t.classList.toggle("active", t.dataset.key === "custom"));
  }

  // ── Generate full CSS from current builder values ──────────
  function generateCSS() {
    const r = bv["--r"];
    const bgHex = bv["--bg"].replace("#", "");
    const bgR = parseInt(bgHex.slice(0, 2), 16),
      bgG = parseInt(bgHex.slice(2, 4), 16),
      bgB = parseInt(bgHex.slice(4, 6), 16);
    const luma = (bgR * 0.299 + bgG * 0.587 + bgB * 0.114) / 255;
    const ov = luma < 0.4 ? "255,255,255" : "0,0,0";
    const cpuHex = bv["--cpu"].replace("#", "");
    const cpuR = parseInt(cpuHex.slice(0, 2), 16),
      cpuG = parseInt(cpuHex.slice(2, 4), 16),
      cpuB = parseInt(cpuHex.slice(4, 6), 16);
    const hotHex = bv["--hot"].replace("#", "");
    const hotR = parseInt(hotHex.slice(0, 2), 16),
      hotG = parseInt(hotHex.slice(2, 4), 16),
      hotB = parseInt(hotHex.slice(4, 6), 16);
    const rs = Math.max(2, Math.round(r * 0.6));
    const lines = [
      `:root {`,
      `  /* ── Core palette ────────────────────── */`,
      `  --bg:        ${bv["--bg"]};`,
      `  --txt:       ${bv["--txt"]};`,
      `  --txt-dim:   ${bv["--txt-dim"]};`,
      `  --txt-muted: ${bv["--txt-muted"]};`,
      `  --hot:       ${bv["--hot"]};`,
      ``,
      `  /* ── Surfaces ─────────────────────────── */`,
      `  --bg-bar:          rgba(0,0,0,.30);`,
      `  --bg-overlay:      rgba(0,0,0,.25);`,
      `  --bg-card:         rgba(${ov},.035);`,
      `  --bg-card-hdr:     rgba(${ov},.025);`,
      `  --bg-input:        rgba(${ov},.05);`,
      `  --bg-canvas:       rgba(0,0,0,.18);`,
      `  --bg-code:         rgba(${ov},.07);`,
      ``,
      `  /* ── Interaction states ───────────────── */`,
      `  --bg-hover:        rgba(${ov},.08);`,
      `  --bg-hover-subtle: rgba(${ov},.04);`,
      `  --bg-active:       rgba(${ov},.10);`,
      `  --bg-sel:          rgba(${cpuR},${cpuG},${cpuB},.12);`,
      `  --bg-danger:       rgba(${hotR},${hotG},${hotB},.18);`,
      `  --bg-err:          rgba(${hotR},${hotG},${hotB},.10);`,
      `  --track-bg:        rgba(${ov},.08);`,
      ``,
      `  /* ── Borders ──────────────────────────── */`,
      `  --bdr:        rgba(${ov},.07);`,
      `  --bhi:        rgba(${ov},.13);`,
      `  --bdr-accent: rgba(${cpuR},${cpuG},${cpuB},.30);`,
      `  --bdr-err:    rgba(${hotR},${hotG},${hotB},.25);`,
      ``,
      `  /* ── Card accents ─────────────────────── */`,
      `  --cpu: ${bv["--cpu"]};  --gpu: ${bv["--gpu"]};  --fan: ${bv["--fan"]};`,
      `  --ssd: ${bv["--ssd"]};  --ram: ${bv["--ram"]};  --net: ${bv["--net"]};`,
      ``,
      `  /* ── Warning ramp ─────────────────────── */`,
      `  --w1: ${bv["--w1"]}; --w2: ${bv["--w2"]}; --w3: ${bv["--w3"]};`,
      `  --w4: ${bv["--w4"]}; --w5: ${bv["--w5"]};`,
      ``,
      `  /* ── Data visualisation ───────────────── */`,
      `  --meter:           rgba(${cpuR},${cpuG},${cpuB},.50);`,
      `  --dot-off-warn:    rgba(${ov},.11);`,
      `  --dot-off-meter:   rgba(${ov},.08);`,
      `  --spark-grid:      rgba(${ov},.06);`,
      `  --spark-vtick:     rgba(${ov},.04);`,
      ``,
      `  /* ── Typography ───────────────────────── */`,
      `  --font-ui:   ${getCSSVar("--font-ui") || "-apple-system,system-ui,sans-serif"};`,
      `  --font-num:  ${getCSSVar("--font-num") || '"Share Tech Mono",monospace'};`,
      `  --font-code: "JetBrains Mono","Fira Code",ui-monospace,monospace;`,
      ``,
      `  /* ── Radii ────────────────────────────── */`,
      `  --r: ${r}px; --rs: ${rs}px;`,
      `}`,
    ];
    return lines.join("\n");
  }

  _tbSync = syncBuilderFromActive;
  _tbGenerateCSS = generateCSS;

  syncBuilderFromActive();
}

function initThemeScreen() {
  // ── Size segmented control ─────────────────────────────────
  const sb = document.getElementById("size-btns");
  sb.innerHTML = "";
  for (const key of ["s", "m", "l"]) {
    const btn = el("button", "size-btn");
    btn.dataset.size = key;
    btn.textContent = SIZES[key].label;
    btn.classList.toggle("active", (cfg.size || "s") === key);
    btn.onclick = () => applySize(key);
    sb.appendChild(btn);
  }

  // ── Display toggles ──────────────────────────────────────────
  const peakToggle = document.getElementById("toggle-peak-markers");
  peakToggle.classList.toggle("on", cfg.showPeakMarkers);
  peakToggle.setAttribute("aria-checked", String(cfg.showPeakMarkers));
  peakToggle.onclick = () => {
    cfg.showPeakMarkers = !cfg.showPeakMarkers;
    saveCfg();
    peakToggle.classList.toggle("on", cfg.showPeakMarkers);
    peakToggle.setAttribute("aria-checked", String(cfg.showPeakMarkers));
    // Redraw immediately rather than waiting on the next data push
    Object.values(sparks).forEach((s) => s.draw());
  };

  // ── Theme tiles ────────────────────────────────────────────
  const g = document.getElementById("theme-grid");
  g.innerHTML = "";
  for (const [key, theme] of Object.entries(THEMES)) {
    const tile = el("div", "theme-tile");
    tile.dataset.key = key;
    if (cfg.theme === key) tile.classList.add("active");
    tile.innerHTML = `<div class="theme-swatches">${theme.swatches.map((c) => `<span class="swatch" style="background:${c}"></span>`).join("")}</div><div class="theme-name">${theme.name}</div>`;
    tile.onclick = () => {
      document
        .querySelectorAll(".theme-tile")
        .forEach((t) => t.classList.remove("active"));
      tile.classList.add("active");
      applyTheme(key);
      // Builder is always visible now — reload it from whatever preset
      // just got selected so the pickers stay in sync with the theme.
      if (_tbSync) _tbSync();
    };
    g.appendChild(tile);
  }

  // "Custom…" tile — always present, active whenever cfg.theme is custom
  const customTile = el("div", "theme-tile theme-tile-custom");
  customTile.dataset.key = "custom";
  if (cfg.theme === "custom") customTile.classList.add("active");
  customTile.innerHTML = `<div class="theme-swatches-custom"><span class="tile-custom-icon">✎</span></div><div class="theme-name">Custom…</div>`;
  customTile.onclick = () => {
    document
      .querySelectorAll(".theme-tile")
      .forEach((t) => t.classList.remove("active"));
    customTile.classList.add("active");
    const css =
      cfg.customThemeCSS || (_tbGenerateCSS ? _tbGenerateCSS() : null);
    if (css) applyTheme("custom", css);
  };
  g.appendChild(customTile);

  // ── Theme Builder ──────────────────────────────────────────
  initThemeBuilder();

  // ── Custom CSS ─────────────────────────────────────────────
  if (cfg.customThemeCSS)
    document.getElementById("custom-css").value = cfg.customThemeCSS;

  document.getElementById("btn-theme-apply").onclick = () => {
    const css = document.getElementById("custom-css").value.trim();
    if (!css.includes("{") || !css.includes("}")) {
      alert("Paste a :root { … } block.");
      return;
    }
    applyTheme("custom", css);
    document
      .querySelectorAll(".theme-tile")
      .forEach((t) => t.classList.toggle("active", t.dataset.key === "custom"));
    if (_tbSync) _tbSync();
  };

  // ── Connection fields ──────────────────────────────────────
  document.getElementById("tc-url").value = cfg.baseUrl;
  document.getElementById("tc-tok").value = cfg.token;
  const persist = () => {
    const u = document.getElementById("tc-url").value.trim().replace(/\/$/, "");
    const t = document.getElementById("tc-tok").value.trim();
    if (u) cfg.baseUrl = u;
    if (t) cfg.token = t;
    saveCfg();
  };
  document.getElementById("tc-url").onchange = persist;
  document.getElementById("tc-tok").onchange = persist;

  // Drawer is shown/hidden by the gear button — no showScreen needed
}

function fmtGB(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "--";
  return v < 100 ? v.toFixed(1) : Math.round(v).toString();
}

function clampPct(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function barColorForPct(pct, baseColor) {
  if (!(typeof pct === "number") || Number.isNaN(pct)) return baseColor;
  if (pct >= 90) return cssVar("--w5");
  if (pct >= 80) return cssVar("--w4");
  if (pct >= 60) return cssVar("--w3");
  return baseColor;
}

function mountLabelFromSlot(slot, fallback = "") {
  const raw = String(slot?.label || slot?.name || fallback || "");
  const m = raw.match(
    /Disk\s+(.+?)\s+(?:Usage|Used|Free|Total)(?:\s*\(.*\))?$/i,
  );
  if (m) return m[1].trim();
  return fallback || raw;
}

function barText(used, total) {
  if (typeof used !== "number" || typeof total !== "number") return "--";
  return `${fmtGB(used)}/${fmtGB(total)} GB`;
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD — card definitions
// ═══════════════════════════════════════════════════════════════

// ── Card type reference ──────────────────────────────────────────
//  "spark"  — 2-col: canvas left | rows right
//             Row flags: sparkKey ("temp"|"load"|"fan") selects the
//             series to feed; dynamicNorm:true lets that series'
//             Y-scale auto-track its peak instead of a fixed 0-100
//             ceiling (for non-percentage metrics, e.g. network
//             throughput); noPlot:true shows value but skips plotting.
//             Rows with pctSid render as bar-rows; otherwise sr rows.
//  "sensor" — rows only, no canvas.
//             Rows with pctSid → bar-row; otherwise → sr row.
//
//  Every card also accepts user-added custom rows (cfg.customRows),
//  reorderable independently of the locked rows above — see
//  customRowsFor() / _renderCustomRowSection().
//
//  (DualSpark, a full-width dual-series canvas, is no longer used by
//  any card here but is left intact below in case a future card
//  wants a full-width graph again.)
// ────────────────────────────────────────────────────────────────
const CARD_DEFS = [
  {
    id: "cpu",
    lbl: "CPU",
    cls: "cpu",
    type: "spark",
    rows: [
      {
        sid: "cpu_temp",
        lbl: "TEMP",
        mode: "warn",
        sparkKey: "temp",
        typeFilter: ["temp"],
      },
      {
        // CPU load comes from Linux /proc/stat — auto-assigned
        sid: "cpu_load",
        lbl: "LOAD",
        mode: "warn",
        sparkKey: "load",
        autoLinux: true,
        pctSid: "cpu_load", // bar row — % of capacity, no used/total pair
      },
      {
        sid: "cpu_fan",
        lbl: "FAN",
        mode: "meter",
        sparkKey: "fan",
        typeFilter: ["rpm"],
      },
    ],
  },
  {
    id: "gpu",
    lbl: "GPU",
    cls: "gpu",
    type: "spark",
    rows: [
      {
        sid: "gpu_temp",
        lbl: "TEMP",
        mode: "warn",
        sparkKey: "temp",
        typeFilter: ["temp"],
      },
      {
        sid: "gpu_load",
        lbl: "LOAD",
        mode: "warn",
        sparkKey: "load",
        typeFilter: ["duty"],
        pctSid: "gpu_load", // bar row — % of capacity, no used/total pair
      },
      {
        sid: "gpu_fan",
        lbl: "FAN",
        mode: "meter",
        sparkKey: "fan",
        typeFilter: ["rpm"],
      },
    ],
  },
  {
    id: "memory",
    lbl: "MEMORY",
    cls: "ram",
    type: "spark",
    rows: [
      {
        sid: "lnx_ram_pct",
        lbl: "RAM",
        mode: "warn",
        sparkKey: "temp",
        pctSid: "lnx_ram_pct",
        usedSid: "lnx_ram_used",
        totalSid: "lnx_ram_total",
        autoLinux: true,
      },
      {
        sid: "lnx_swap_pct",
        lbl: "SWAP",
        mode: "warn",
        sparkKey: "load",
        pctSid: "lnx_swap_pct",
        usedSid: "lnx_swap_used",
        totalSid: "lnx_swap_tot",
        autoLinux: true,
      },
    ],
  },
  {
    id: "net",
    lbl: "NETWORK",
    cls: "net",
    type: "spark",
    rows: [
      {
        sid: "lnx_net_rx",
        lbl: "↓ RX",
        autoLinux: true,
        sparkKey: "temp",
        dynamicNorm: true,
      },
      {
        sid: "lnx_net_tx",
        lbl: "↑ TX",
        autoLinux: true,
        sparkKey: "load",
        dynamicNorm: true,
      },
    ],
  },
  {
    // Storage: auto-generated from Linux disk data (no static slots)
    id: "storage",
    lbl: "STORAGE",
    cls: "ssd",
    type: "sensor",
    autoDisks: true,
    rows: [],
  },
  {
    id: "case",
    lbl: "CHASSIS",
    cls: "fan",
    type: "sensor",
    rows: [
      {
        sid: "case_temp",
        lbl: "AMB",
        mode: "warn",
        typeFilter: ["temp"],
      },
    ],
  },
];

// ── Helpers used by buildCards ───────────────────────────────────
// dashStyle: "solid" | "dashed" | "dotted"
// Element order: [accent] [lbl flex:1] [dots] [val] [unit]
function _accentBg(color, dashStyle) {
  if (dashStyle === "dashed")
    return `repeating-linear-gradient(to bottom,${color} 0px,${color} 4px,transparent 4px,transparent 8px)`;
  if (dashStyle === "dotted")
    return `repeating-linear-gradient(to bottom,${color} 0px,${color} 2px,transparent 2px,transparent 5px)`;
  return color; // solid
}

function _buildSrRow(row, accentColor, dashStyle = "solid") {
  const sd = SLOTS.find((s) => s.id === row.sid);
  // Custom rows aren't in SLOTS — derive unit from the assigned slot instead
  const unit = sd?.unit ?? cfg.slots[row.sid]?.unit ?? "";
  const srow = el("div", "sr");
  srow.id = "sr-" + row.sid;
  srow.dataset.sub = "--"; // populated with peak info on first render tick
  // Order: [accent] [lbl flex:1] [val] [unit] [dots]
  srow.innerHTML = `
<span class="sr-accent" style="background:${_accentBg(accentColor, dashStyle)}"></span>
<span class="sr-lbl">${row.lbl}</span>
<span class="sr-val" id="sv-${row.sid}">--</span>
<span class="sr-unit">${unit}</span>
${row.mode && getRowStyle(row) !== "num-only" ? `<span id="sd-${row.sid}">${makeDots(0, getRowStyle(row) === "dots-meter" ? "meter" : "warn")}</span>` : ""}`;
  return srow;
}

function _buildBarRow(row, baseColor, dashStyle = "solid") {
  const slot = cfg.slots[row.sid];
  const label = /^[A-C]$/.test(row.lbl)
    ? mountLabelFromSlot(slot, row.lbl)
    : row.lbl || mountLabelFromSlot(slot, "");
  const srow = el("div", "sr");
  srow.id = "bar-" + row.sid;
  srow.dataset.sub = "--"; // populated with used/total and/or peak on render
  srow.innerHTML = `
<span class="sr-accent" style="background:${_accentBg(baseColor, dashStyle)}"></span>
<span class="sr-lbl" id="bl-${row.sid}">${esc(label)}</span>
${row.usedSid || row.totalSid ? `<span class="br-sub" id="bv-${row.sid}" aria-hidden="true">--</span>` : ""}
<span class="br-pct-num" id="bp-${row.sid}">--</span><span class="br-pct-unit">%</span>
<div class="br-track"><div class="br-fill" id="bf-${row.sid}" style="width:0%;background:${baseColor}"></div></div>`;
  return srow;
}

function buildCards() {
  const c = document.getElementById("cards");
  c.innerHTML = "";
  sparks = {};

  if (editMode) c.classList.add("editing");
  else c.classList.remove("editing");

  const linuxDev = liveDevices.find((d) => d.uid === "linux-system");
  const linuxLat = linuxDev ? getLatest(linuxDev) : null;
  const linuxHasData = !!linuxLat;

  for (const def of CARD_DEFS) {
    // ── Visibility ────────────────────────────────────────────
    const hasAssigned = def.rows?.some((r) => !r.autoLinux && cfg.slots[r.sid]);
    const hasAutoLinux = def.rows?.some((r) => r.autoLinux) && linuxHasData;
    const hasDiskRows =
      def.autoDisks &&
      linuxHasData &&
      linuxLat.channels?.some((ch) => /^Disk .+ Usage$/.test(ch.name));
    const hasCustomRows = (cfg.customRows?.[def.id]?.length ?? 0) > 0;
    const hasEditRows =
      editMode &&
      (def.rows?.some((r) => !r.autoLinux && r.typeFilter) || def.autoDisks);

    if (
      !hasAssigned &&
      !hasAutoLinux &&
      !hasDiskRows &&
      !hasCustomRows &&
      !hasEditRows
    )
      continue;

    const card = el("div", "card");
    card.id = "card-" + def.id;
    card.innerHTML = `<div class="card-hdr ${def.cls}"><span class="card-ttl">${def.lbl}</span></div>`;
    c.appendChild(card);

    const cardColor = cssVar("--" + def.cls);
    const fanColor = cssVar("--fan");
    const loadColor = withAlpha(cardColor, 0.55);
    const fanLine = def.cls === "fan" ? cardColor : fanColor;

    // ── spark ─────────────────────────────────────────────────
    if (def.type === "spark") {
      const body = el("div", "card-spark");
      card.appendChild(body);

      const scol = el("div", "spark-col");
      body.appendChild(scol);
      const {
        spark: { w: CW, h: CH },
      } = canvasDims();
      const dpr = window.devicePixelRatio || 1;
      const cv = document.createElement("canvas");
      cv.width = CW * dpr;
      cv.height = CH * dpr;
      cv.style.width = CW + "px";
      cv.style.height = CH + "px";
      scol.appendChild(cv);
      sparks[def.id] = new MultiSpark(cv, {
        cardColor,
        loadColor,
        fanLine,
        W: CW,
        H: CH,
        dpr,
      });
      for (const r of def.rows) {
        if (r.dynamicNorm) sparks[def.id].setDynamic(r.sparkKey, true);
      }

      const rcol = el("div", "card-rows");
      body.appendChild(rcol);

      // ── Context section (noPlot + custom rows) ────────────────
      // Built separately and appended below the spark grid so it's
      // visually unambiguous what is plotted vs what is context.
      const ctxBody = el("div", "card-spark-ctx");

      for (const row of def.rows) {
        if (row.autoLinux) {
          if (!cfg.slots[row.sid] && !linuxHasData) continue;
          let accent = cardColor,
            dash = "solid";
          if (row.sparkKey === "fan") {
            accent = fanLine;
            dash = "dotted";
          }
          if (row.sparkKey === "load") {
            accent = loadColor;
            dash = "dashed";
          }
          const elem =
            getRowStyle(row) === "bar"
              ? _buildBarRow(row, accent, dash)
              : _buildSrRow(row, accent, dash);
          if (editMode) _hardRowMenu(elem, row, { isAutoLinux: true });
          rcol.appendChild(elem);
          continue;
        }
        // CC / noPlot rows — show if assigned or in editMode
        if (!cfg.slots[row.sid] && !editMode) continue;
        let accent = cardColor,
          dash = "solid";
        if (row.sparkKey === "fan") {
          accent = fanLine;
          dash = "dotted";
        }
        if (row.sparkKey === "load") {
          accent = loadColor;
          dash = "dashed";
        }
        // noPlot rows: neutral dim accent — not part of sparkline legend
        if (row.noPlot) {
          accent = withAlpha(cssVar("--txt-dim"), 0.45);
          dash = "solid";
        }
        const elem =
          getRowStyle(row) === "bar"
            ? _buildBarRow(row, accent, dash)
            : _buildSrRow(row, accent, dash);
        if (editMode) _hardRowMenu(elem, row);
        // noPlot rows go in the context section below the spark grid
        if (row.noPlot) {
          ctxBody.appendChild(elem);
        } else {
          rcol.appendChild(elem);
        }
      }

      // Custom rows always live in the context section
      _renderCustomRowSection(def, ctxBody);

      // Only attach ctxBody if it has visible children (or edit mode for the
      // "+ Add row" affordance which _renderCustomRowSection renders)
      if (ctxBody.childElementCount > 0) {
        card.appendChild(ctxBody);
      }
    }

    // ── sensor ────────────────────────────────────────────────
    else if (def.type === "sensor") {
      const body = el("div", "card-rows-full");
      card.appendChild(body);

      // Auto-disk: rows generated from live Linux disk data
      if (def.autoDisks && linuxLat) {
        const diskChs =
          linuxLat.channels?.filter((ch) => /^Disk .+ Usage$/.test(ch.name)) ??
          [];

        for (const ch of diskChs) {
          const mount = ch.name.replace(/^Disk /, "").replace(/ Usage$/, "");
          if ((cfg.hiddenMounts ?? []).includes(mount)) continue;
          const safeId = "ad-" + mount.replace(/[^a-zA-Z0-9]/g, "_");
          const usedCh = linuxLat.channels?.find(
            (c) => c.name === `Disk ${mount} Used`,
          );
          const totalCh = linuxLat.channels?.find(
            (c) => c.name === `Disk ${mount} Total`,
          );
          const pctRaw = typeof ch.duty === "number" ? ch.duty : undefined;
          const used = usedCh?.watts;
          const total = totalCh?.watts;
          const pct = clampPct(pctRaw ?? 0);
          const mountLbl =
            mount === "/" ? "root" : mount.split("/").pop() || mount;
          const barClr = barColorForPct(pct, cardColor);

          const srow = el("div", "sr");
          srow.id = "bar-" + safeId;
          srow.dataset.sub = barText(used, total);
          srow.innerHTML = `
<span class="sr-accent" style="background:${cardColor}"></span>
<span class="sr-lbl" id="bl-${safeId}">${esc(mountLbl)}</span>
<span class="br-sub" id="bv-${safeId}" aria-hidden="true">${barText(used, total)}</span>
<span class="br-pct-num" id="bp-${safeId}">${pctRaw !== undefined ? Math.round(pct) : "--"}</span><span class="br-pct-unit">%</span>
<div class="br-track"><div class="br-fill" id="bf-${safeId}" style="width:${pct}%;background:${barClr}"></div></div>`;
          if (editMode) {
            const hideBtn = el("button", "slot-clr");
            hideBtn.title = `Hide ${mount}`;
            hideBtn.textContent = "×";
            hideBtn.onclick = (e) => {
              e.stopPropagation();
              cfg.hiddenMounts ??= [];
              if (!cfg.hiddenMounts.includes(mount))
                cfg.hiddenMounts.push(mount);
              saveCfg();
              buildCards();
              renderDashboard(liveDevices);
              requestAnimationFrame(() => autoResize());
            };
            srow.appendChild(hideBtn);
          }
          body.appendChild(srow);
        }

        // Show hidden mounts with restore affordance
        if (editMode && cfg.hiddenMounts?.length) {
          for (const mount of cfg.hiddenMounts) {
            const mountLbl =
              mount === "/" ? "root" : mount.split("/").pop() || mount;
            const rrow = el("div", "sr hidden-mount");
            rrow.innerHTML = `<span class="sr-accent" style="background:${cardColor};opacity:.3"></span>
<span class="sr-lbl">${esc(mountLbl)}</span>`;
            const restBtn = el("button", "assign-badge");
            restBtn.textContent = "show";
            restBtn.onclick = (e) => {
              e.stopPropagation();
              cfg.hiddenMounts = cfg.hiddenMounts.filter((m) => m !== mount);
              saveCfg();
              buildCards();
              renderDashboard(liveDevices);
              requestAnimationFrame(() => autoResize());
            };
            rrow.appendChild(restBtn);
            body.appendChild(rrow);
          }
        }
      }

      // Named rows (chassis AMB/FAN/etc.)
      for (const row of def.rows || []) {
        const assigned = cfg.slots[row.sid];
        if (!row.autoLinux && !assigned && !editMode) continue;
        // Fan label override
        const customLbl = cfg.fanLabels?.[row.sid];
        const displayRow = customLbl ? { ...row, lbl: customLbl } : row;
        const elem =
          getRowStyle(row) === "bar"
            ? _buildBarRow(displayRow, cardColor)
            : _buildSrRow(displayRow, cardColor);
        if (editMode) _hardRowMenu(elem, row);
        body.appendChild(elem);
      }
      _renderCustomRowSection(def, body);
    }
  }

  requestAnimationFrame(() => autoResize());
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-RESIZE
//  Measures true card content height and notifies Python so the
//  GTK window snaps to fit — no scroll, no dead space.
// ═══════════════════════════════════════════════════════════════
const DRAWER_W = 280; // matches #drawer's fixed width in monitor.css

function autoResize() {
  // Don't send a zero-height resize while dashboard is hidden
  if (document.getElementById("s-dash").classList.contains("hide")) return;
  const sbarH = document.getElementById("sbar").offsetHeight;
  const borders = 2; // #app top + bottom border
  const baseW = (SIZES[cfg.size] || SIZES.s).width;
  const screenPad = 24; // .screen { padding: 12px } × 2 sides
  const cardsH = document.getElementById("cards").scrollHeight;

  let w, contentH;
  if (drawerOpen) {
    // Drawer sits beside the dashboard, not on top of it — window widens to
    // fit both columns, and height follows whichever column is taller.
    // +4 safety margin: .drawer-inner's content is identical at every size,
    // so any shortfall here would show up as a hairline scrollbar on every
    // preset rather than scaling with anything — a sub-pixel rounding /
    // scrollbar-gutter reflow away from fitting exactly. Cheaper to pad
    // the measurement than chase the exact fractional pixel.
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

// ═══════════════════════════════════════════════════════════════
//  RENDER DASHBOARD
// ═══════════════════════════════════════════════════════════════

function renderDashboard(devices) {
  for (const def of CARD_DEFS) {
    // ── Named rows (standard + autoLinux) ────────────────────
    for (const row of def.rows || []) {
      if (!cfg.slots[row.sid]) continue;

      const slot = cfg.slots[row.sid];
      const v = getSlotValue(devices, slot);
      const sv = document.getElementById("sv-" + row.sid);
      const sd = document.getElementById("sd-" + row.sid);
      const sd2 = SLOTS.find((s) => s.id === row.sid);
      if (sv) sv.textContent = fmt1(v, sd2?.unit ?? "");
      if (sd && v !== undefined) {
        const lvl =
          row.mode === "warn"
            ? warnLevel(row.sid, v)
            : dutyLevel(getFanDuty(devices, slot));
        sd.innerHTML = makeDots(
          lvl,
          getRowStyle(row) === "dots-meter" ? "meter" : "warn",
        );
      }
      _trackPeak(row.sid, v);

      if ((def.type === "sensor" || def.type === "spark") && row.pctSid) {
        const used = row.usedSid
          ? getSlotValue(devices, cfg.slots[row.usedSid])
          : undefined;
        const total = row.totalSid
          ? getSlotValue(devices, cfg.slots[row.totalSid])
          : undefined;
        const pctRaw = getSlotValue(devices, slot);
        const pct = clampPct(pctRaw);

        const bf = document.getElementById("bf-" + row.sid);
        const bv = document.getElementById("bv-" + row.sid);
        const bp = document.getElementById("bp-" + row.sid);

        const rowVisible =
          pctRaw !== undefined ||
          (typeof used === "number" && typeof total === "number");
        const rowEl = document.getElementById("bar-" + row.sid);
        if (rowEl) rowEl.classList.toggle("bar-hide", !rowVisible);

        if (bf) {
          bf.style.width = `${pct}%`;
          bf.style.background = barColorForPct(pct, cssVar("--" + def.cls));
        }
        if (bp)
          bp.textContent = pctRaw !== undefined ? `${Math.round(pct)}` : "--";
        if (bv) bv.textContent = barText(used, total);
        _updatePeakTip(row.sid, "%", barText(used, total));
      } else {
        _updatePeakTip(row.sid, sd2?.unit ?? "");
      }
    }

    // ── Auto-disk rows ────────────────────────────────────────
    if (def.autoDisks) {
      const linuxDev = devices.find((d) => d.uid === "linux-system");
      const lat = getLatest(linuxDev);
      if (lat) {
        const diskChs =
          lat.channels?.filter((ch) => /^Disk .+ Usage$/.test(ch.name)) ?? [];
        for (const ch of diskChs) {
          const mount = ch.name.replace(/^Disk /, "").replace(/ Usage$/, "");
          if ((cfg.hiddenMounts ?? []).includes(mount)) continue;
          const safeId = "ad-" + mount.replace(/[^a-zA-Z0-9]/g, "_");
          // If the DOM row doesn't exist yet, trigger a rebuild
          if (!document.getElementById("bar-" + safeId)) {
            buildCards();
            return;
          }
          const usedCh = lat.channels?.find(
            (c) => c.name === `Disk ${mount} Used`,
          );
          const totalCh = lat.channels?.find(
            (c) => c.name === `Disk ${mount} Total`,
          );
          const pctRaw = typeof ch.duty === "number" ? ch.duty : undefined;
          const used = usedCh?.watts;
          const total = totalCh?.watts;
          const pct = clampPct(pctRaw ?? 0);
          const bf = document.getElementById("bf-" + safeId);
          const bv = document.getElementById("bv-" + safeId);
          const bp = document.getElementById("bp-" + safeId);
          if (bf) {
            bf.style.width = `${pct}%`;
            bf.style.background = barColorForPct(pct, cssVar("--ssd"));
          }
          if (bp)
            bp.textContent = pctRaw !== undefined ? `${Math.round(pct)}` : "--";
          if (bv) bv.textContent = barText(used, total);
          _trackPeak(safeId, pctRaw);
          _updatePeakTip(safeId, "%", barText(used, total));
        }
      }
    }

    // ── Spark canvas feeds ────────────────────────────────────
    const spark = sparks[def.id];
    if (!spark || !def.rows) continue;

    if (def.type === "spark") {
      spark.tick();
      for (const row of def.rows) {
        if (!cfg.slots[row.sid] || !row.sparkKey || row.noPlot) continue;
        const v = getSlotValue(devices, cfg.slots[row.sid]);
        if (row.sparkKey === "fan") {
          const duty = getFanDuty(devices, cfg.slots[row.sid]);
          if (duty !== undefined) {
            spark.setFanNorm(100);
            spark.push("fan", duty);
          } else if (v !== undefined) {
            spark.trackFanMax(v);
            spark.push("fan", v);
          }
        } else {
          spark.push(row.sparkKey, v, sessionPeaks[row.sid]);
        }
      }
    }
  }

  // ── Custom rows — update all cards ───────────────────────────
  // renderDashboard's main loop above handles def.rows only;
  // custom rows use the same slot machinery but live in cfg.customRows.
  for (const rows of Object.values(cfg.customRows ?? {})) {
    for (const row of rows) {
      const slot = cfg.slots[row.sid];
      if (!slot) continue;
      const v = getSlotValue(devices, slot);
      const sv = document.getElementById("sv-" + row.sid);
      const sd = document.getElementById("sd-" + row.sid);
      // Derive unit from the slot itself (custom rows aren't in SLOTS)
      const unit =
        slot.unit ??
        (slot.field === "duty"
          ? "%"
          : slot.field === "rpm"
            ? "RPM"
            : slot.kind === "temp"
              ? "°C"
              : "");
      if (sv) sv.textContent = fmt1(v, unit);
      if (sd && v !== undefined) {
        const lvl =
          row.mode === "warn"
            ? warnLevel(row.sid, v)
            : dutyLevel(getFanDuty(devices, slot));
        sd.innerHTML = makeDots(
          lvl,
          getRowStyle(row) === "dots-meter" ? "meter" : "warn",
        );
      }
      _trackPeak(row.sid, v);
      _updatePeakTip(row.sid, unit);
    }
  }
}
// ═══════════════════════════════════════════════════════════════
//  DUAL-SERIES SPARKLINE  (memgraph / netgraph)
//
//  Two series sharing the same Y axis:
//    A — solid line + gradient fill  (RAM%, RX)
//    B — dashed line, no fill        (Swap%, TX)
//
//  fixedMax:null  → Y auto-scales to 115% of peak observed
//  fixedMax:100   → Y fixed 0–100 (percentages)
// ═══════════════════════════════════════════════════════════════
class DualSpark {
  constructor(canvas, { colorA, colorB, W, H, dpr = 1, fixedMax = null } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
    this.MAX = 60;
    this.colorA = colorA;
    this.colorB = colorB;
    this.fixedMax = fixedMax;
    this._peak = fixedMax ?? 1;
    this.dataA = [];
    this.dataB = [];
  }

  push(a, b) {
    const add = (arr, v) => {
      if (v != null && !isNaN(v)) {
        arr.push(v);
        if (arr.length > this.MAX) arr.shift();
      }
    };
    add(this.dataA, a);
    add(this.dataB, b);
    if (this.fixedMax == null) {
      this._peak = Math.max(1, ...this.dataA, ...this.dataB) * 1.15;
    } else {
      this._peak = this.fixedMax;
    }
    this.draw();
  }

  draw() {
    const { ctx, W, H, MAX, dataA, dataB, colorA, colorB, _peak: norm } = this;
    ctx.clearRect(0, 0, W, H);

    const xOf = (i, len) => (i + MAX - len) * (W / (MAX - 1));
    const yOf = (v) =>
      H - Math.min(1, Math.max(0, v / norm)) * H * 0.86 - H * 0.04;

    // ── Grid ─────────────────────────────────────────────────
    // Boosted to a fixed, legible alpha here rather than trusting each
    // theme's --spark-grid value — several themes tuned it low enough
    // to be nearly invisible against their background, which defeats
    // the point of a level reference. Hue still comes from the theme;
    // only opacity is normalized. Midline reads a touch brighter as an
    // at-a-glance "half" mark.
    ctx.save();
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    const gridColor = cssVar("--spark-grid") || "rgba(255,255,255,0.06)";
    for (const pct of [0.25, 0.5, 0.75, 1.0]) {
      const y = H - pct * H * 0.86 - H * 0.04;
      ctx.strokeStyle = withAlpha(gridColor, pct === 0.5 ? 0.22 : 0.13);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    // ── Series B: dashed, no fill (drawn first, sits behind) ──
    if (dataB.length >= 2) {
      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = colorB;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      dataB.forEach((v, i) => {
        const x = xOf(i, dataB.length),
          y = yOf(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // ── Series A: solid + gradient fill (drawn on top) ────────
    if (dataA.length >= 2) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, withAlpha(colorA, 0.22));
      g.addColorStop(1, withAlpha(colorA, 0.0));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xOf(0, dataA.length), H);
      dataA.forEach((v, i) => ctx.lineTo(xOf(i, dataA.length), yOf(v)));
      ctx.lineTo(xOf(dataA.length - 1, dataA.length), H);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = colorA;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      dataA.forEach((v, i) => {
        const x = xOf(i, dataA.length),
          y = yOf(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  MULTI-SERIES SPARKLINE
//
//  Three series (drawn fan→load→temp so temp sits on top):
//    temp — solid + fill, card colour
//    load — dashed (5,3), card colour @ 55% alpha
//    fan  — dotted (2,4), fan accent colour
//
//  Grid: horizontal lines at 25/50/75/100 %
//        vertical time markers every 8 data points (~16 s)
//
//  Legend: drawn INSIDE the canvas at the bottom — no HTML strip.
//  The line style samples (solid / dashed / dotted) replace the
//  old text legend and eliminate the double-legend issue.
// ═══════════════════════════════════════════════════════════════
class MultiSpark {
  constructor(canvas, { cardColor, loadColor, fanLine, W, H, dpr = 1 } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
    this.MAX = 60; // data points kept
    this.BAR = 8; // vertical marker every N points

    this.S = {
      temp: {
        data: [],
        norm: 100,
        dynamic: false,
        color: cardColor,
        dash: [],
        lw: 1.6,
        fill: true,
        peak: undefined,
      },
      load: {
        data: [],
        norm: 100,
        dynamic: false,
        color: loadColor,
        dash: [5, 3],
        lw: 1.2,
        fill: false,
        peak: undefined,
      },
      fan: {
        data: [],
        norm: 100,
        dynamic: false,
        color: fanLine,
        dash: [2, 4],
        lw: 1.0,
        fill: false,
        peak: undefined,
      },
    };

    // Peak markers are real DOM elements (not canvas-drawn) parented
    // to the canvas's own container (.spark-col, which has
    // position:relative for exactly this), so they can physically
    // straddle the canvas border and spill into the gap beside it —
    // canvas content is always clipped to its own bitmap and can
    // never overflow that way.
    this.peakDots = {};
    const container = canvas.parentElement;
    for (const key of Object.keys(this.S)) {
      const dot = document.createElement("div");
      dot.className = "spark-peak-dot";
      dot.style.display = "none";
      container.appendChild(dot);
      this.peakDots[key] = dot;
    }

    // Wall-clock timestamps paralleling the data buffers — lets the
    // canvas show an honest "how much time is this window" label
    // instead of a fixed guess, since push cadence isn't perfectly
    // regular (it's driven by whichever data source — CC SSE or the
    // Linux stats timer — fires next).
    this.times = [];
  }

  // Call once per render tick (not per push) so the time-horizon label
  // reflects real elapsed time even when a card's series don't all
  // push on the same tick.
  tick() {
    this.times.push(Date.now());
    if (this.times.length > this.MAX) this.times.shift();
  }

  // Mark a series as auto-scaling: its norm grows to track the
  // highest value seen (×1.2 headroom), rather than staying fixed
  // at 100. Use for metrics with no natural 0–100 ceiling (e.g.
  // network throughput in MB/s).
  setDynamic(key, dynamic = true) {
    const s = this.S[key];
    if (s) s.dynamic = dynamic;
  }
  setNorm(key, n) {
    const s = this.S[key];
    if (s) s.norm = n;
  }
  trackMax(key, val) {
    const s = this.S[key];
    if (!s || typeof val !== "number" || isNaN(val)) return;
    if (val > s.norm) s.norm = val * 1.2;
  }

  // Back-compat wrappers — fan duty/RPM dual-mode feed in
  // renderDashboard() calls these by name.
  setFanNorm(n) {
    this.setNorm("fan", n);
  }
  trackFanMax(rpm) {
    this.trackMax("fan", rpm);
  }

  push(key, val, peakOverride) {
    if (val == null || isNaN(val)) return;
    const s = this.S[key];
    if (!s) return;
    if (s.dynamic) this.trackMax(key, val);
    s.data.push(val);
    if (s.data.length > this.MAX) s.data.shift();
    if (typeof peakOverride === "number") {
      // Caller has a persistent, correctly-scaled peak already (e.g.
      // sessionPeaks, which survives card rebuilds) — trust it over
      // this instance's own short-lived tracking.
      s.peak = peakOverride;
    } else if (s.peak === undefined || val > s.peak) {
      s.peak = val;
    }
    this.draw();
  }

  draw() {
    const { ctx, W, H, S, MAX, BAR } = this;

    const GH = H;

    ctx.clearRect(0, 0, W, H);

    const xOf = (i, len) => (i + MAX - len) * (W / (MAX - 1));
    const yOf = (v, norm) => {
      const p = Math.min(1, Math.max(0, v / (norm || 1)));
      return GH - p * GH * 0.86 - GH * 0.04;
    };

    // ── Horizontal gridlines ──────────────────────────────────
    // Boosted to a fixed, legible alpha here rather than trusting each
    // theme's --spark-grid value — several themes tuned it low enough
    // to be nearly invisible against their background, which defeats
    // the point of a level reference. Hue still comes from the theme;
    // only opacity is normalized. Midline reads a touch brighter as an
    // at-a-glance "half" mark.
    ctx.save();
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    const gridColor = cssVar("--spark-grid") || "rgba(255,255,255,0.06)";
    for (const pct of [0.25, 0.5, 0.75, 1.0]) {
      const y = GH - pct * GH * 0.86 - GH * 0.04;
      ctx.strokeStyle = withAlpha(gridColor, pct === 0.5 ? 0.22 : 0.13);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // ── Vertical time markers ─────────────────────────────────
    const maxLen = Math.max(...Object.values(S).map((s) => s.data.length), 2);
    ctx.strokeStyle = withAlpha(
      cssVar("--spark-vtick") || "rgba(255,255,255,0.04)",
      0.09,
    );
    for (let i = maxLen - 1; i >= 0; i -= BAR) {
      const x = xOf(i, maxLen);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GH);
      ctx.stroke();
    }
    ctx.restore();

    // ── Series: fan → load → temp ─────────────────────────────
    for (const key of ["fan", "load", "temp"]) {
      const s = S[key];
      if (s.data.length < 2) continue;

      if (s.fill) {
        const g = ctx.createLinearGradient(0, 0, 0, GH);
        g.addColorStop(0, withAlpha(s.color, 0.22));
        g.addColorStop(1, withAlpha(s.color, 0.0));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xOf(0, s.data.length), GH);
        s.data.forEach((v, i) =>
          ctx.lineTo(xOf(i, s.data.length), yOf(v, s.norm)),
        );
        ctx.lineTo(xOf(s.data.length - 1, s.data.length), GH);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.setLineDash(s.dash);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.lw;
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = xOf(i, s.data.length),
          y = yOf(v, s.norm);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      // Peak marker — a DOM element (see constructor), positioned here
      // to sit at this series' peak height, right on the canvas's
      // border. Unlike canvas drawing it isn't clipped to the bitmap,
      // so it can actually spill into the gap beside the canvas rather
      // than being cut off at the edge. Gated behind a preference since
      // it's a taste call, not everyone wants the extra marks.
      const dot = this.peakDots[key];
      if (dot) {
        if (cfg.showPeakMarkers && s.peak !== undefined) {
          dot.style.top = yOf(s.peak, s.norm) + "px";
          dot.style.background = s.color;
          dot.style.display = "block";
        } else {
          dot.style.display = "none";
        }
      }
    }

    // ── Time-horizon label ────────────────────────────────────
    // Honest elapsed-time span of the visible window — push cadence
    // isn't perfectly regular, so this reads real timestamps rather
    // than assuming a fixed interval per data point. Drawn on a small
    // scrim (not just bare text) since a fixed corner otherwise gets
    // run over by whatever's plotted near its floor — this guarantees
    // legibility regardless of size preset or where the line sits.
    const span = _fmtSpan(
      this.times.length >= 2
        ? this.times[this.times.length - 1] - this.times[0]
        : undefined,
    );
    if (span) {
      const fontSize = Math.max(7, Math.round(GH * 0.088));
      const label = `-${span}`;
      ctx.save();
      ctx.font = `${fontSize}px ${cssVar("--font-num") || "monospace"}`;
      const textW = ctx.measureText(label).width;
      const padX = 4,
        padY = 2;
      const boxW = textW + padX * 2;
      const boxH = fontSize + padY * 2;
      ctx.fillStyle = withAlpha(
        cssVar("--bg-canvas") || "rgba(0,0,0,0.18)",
        0.82,
      );
      ctx.fillRect(0, GH - boxH, boxW, boxH);
      ctx.fillStyle = withAlpha(cssVar("--txt-dim") || "#888", 0.85);
      ctx.textBaseline = "bottom";
      ctx.fillText(label, padX, GH - padY);
      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
(async () => {
  loadCfg();
  applySize(cfg.size || "s", false); // apply before theme so vars are set
  applyTheme(
    cfg.theme === "custom" ? "custom" : cfg.theme || "deep-space",
    cfg.theme === "custom" ? cfg.customThemeCSS : null,
  );

  if (cfg.token) {
    phase = "connecting";
    setStatus("spin", "Connecting…");
    document.getElementById("i-url").value = cfg.baseUrl;
    document.getElementById("i-tok").value = cfg.token;
    const btn = document.getElementById("btn-connect");
    btn.textContent = "Connecting…";
    btn.disabled = true;
    showScreen("s-setup");
    document.getElementById("btn-reset").onclick = () => {
      if (!confirm("Clear saved CoolerControl settings and token?")) return;
      localStorage.clear();
      location.reload();
    };
    startSSE();
  } else {
    initSetup();
  }
})();
