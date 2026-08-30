/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — monitor.js
   ────────────────────────────────────────────────────────────────────────────
   Main application — sizes, config, data fetching, card building,
   dashboard rendering, theme screen, setup screen.
   Depends on: themes.js (must be loaded first).
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
  theme: "deep-space",
  customThemeCSS: "",
  size: "s",
  hiddenMounts: [],
  rowStyles: {},
  customRows: {},
  rowOrder: {},
  cardOrder: [],
  sparkOff: {},
  peakOff: {},
  cardHidden: {},
  cardLabels: {},
  cardMini: {},
  anchorCorner: null,
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

// Style options available for a row, in display order.
function _rowStyleOptions(row) {
  if (row.pctSid) return ["bar", "dots-warn", "dots-meter", "num-only"];
  if (row.mode) return ["dots-warn", "dots-meter", "num-only"];
  return [];
}

function setRowStyle(row, style) {
  cfg.rowStyles ??= {};
  cfg.rowStyles[row.sid] = style;
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// ═══════════════════════════════════════════════════════════════
//  "⋯" ROW MENU
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

// items: [{ label, danger?, onClick }] or
//        [{ type: "segmented", options: [{value,label,title}], current, onSelect }] or
//        [{ type: "color", label?, value, onChange }]
function _openRowMenu(anchorBtn, items) {
  _closeRowMenu();
  const menu = el("div", "row-menu");
  for (const it of items) {
    if (it.type === "segmented") {
      const seg = el("div", "row-menu-seg");
      for (const opt of it.options) {
        const b = el(
          "button",
          "row-menu-seg-btn" + (opt.value === it.current ? " active" : ""),
        );
        b.textContent = opt.label;
        if (opt.title) b.title = opt.title;
        b.onclick = (e) => {
          e.stopPropagation();
          _closeRowMenu();
          it.onSelect(opt.value);
        };
        seg.appendChild(b);
      }
      menu.appendChild(seg);
      continue;
    }
    if (it.type === "color") {
      const wrap = el("div", "row-menu-color");
      if (it.label) {
        const lbl = el("span", "row-menu-color-lbl");
        lbl.textContent = it.label;
        wrap.appendChild(lbl);
      }
      const row = el("div", "row-menu-color-row");
      // Same wrapper-div + invisible-input technique as .tb-swatch, so
      // this chip renders as a clean filled rounded square instead of
      // a native color-input frame — matches the rest of the app rather
      // than introducing a second, uglier swatch style.
      const chipWrap = el("div", "row-menu-color-chip");
      chipWrap.style.background = it.value;
      const chip = document.createElement("input");
      chip.type = "color";
      chip.value = it.value;
      chipWrap.appendChild(chip);
      const hexInp = document.createElement("input");
      hexInp.type = "text";
      hexInp.className = "row-menu-color-hex";
      hexInp.maxLength = 7;
      hexInp.spellcheck = false;
      hexInp.value = it.value;
      hexInp.placeholder = "#rrggbb";

      // Chip stays a native colour picker too — a quick eyeball option
      // alongside the typeable hex field.
      chip.addEventListener("input", (e) => {
        hexInp.classList.remove("invalid");
        hexInp.value = e.target.value;
        chipWrap.style.background = e.target.value;
        it.onChange(e.target.value);
      });
      const applyHex = () => {
        let v = hexInp.value.trim();
        if (v && !v.startsWith("#")) v = "#" + v;
        if (/^#[0-9a-f]{6}$/i.test(v)) {
          hexInp.classList.remove("invalid");
          hexInp.value = v;
          chip.value = v;
          chipWrap.style.background = v;
          it.onChange(v);
        } else {
          hexInp.classList.add("invalid");
        }
      };
      hexInp.addEventListener("input", applyHex);
      hexInp.addEventListener("blur", () => {
        if (!/^#[0-9a-f]{6}$/i.test(hexInp.value.trim())) {
          hexInp.classList.remove("invalid");
          hexInp.value = chip.value; // revert to last valid colour
        }
      });
      hexInp.addEventListener("keydown", (e) => e.stopPropagation());

      row.appendChild(chipWrap);
      row.appendChild(hexInp);
      wrap.appendChild(row);
      menu.appendChild(wrap);
      continue;
    }
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
//  SUB TOOLTIP — shows the "used / total GB" label
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

const _STYLE_LABELS = {
  bar: "▬",
  "dots-warn": "●●",
  "dots-meter": "○○",
  "num-only": "#",
};
const _STYLE_TITLES = {
  bar: "Bar",
  "dots-warn": "Warning dots",
  "dots-meter": "Meter dots",
  "num-only": "Number only",
};
function _styleSegItem(row) {
  const options = _rowStyleOptions(row);
  if (!options.length) return null;
  return {
    type: "segmented",
    current: getRowStyle(row),
    options: options.map((v) => ({
      value: v,
      label: _STYLE_LABELS[v],
      title: _STYLE_TITLES[v],
    })),
    onSelect: (v) => setRowStyle(row, v),
  };
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
    // Style toggle (only when meaningful) — multi-segment, pick directly
    const seg = _styleSegItem(row);
    if (seg) items.push(seg);
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
//  CUSTOM ROWS — user-added rows on a card. Always noPlot (display
//  only, never feed the sparkline). Reuse cfg.slots/typeFilter/style
//  machinery from built-in rows, with a generated sid + own order.
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
// Rows live inside their own .custom-rows-list wrapper so pointer-drag
// reordering (see initRowSort()) never mixes them with disk/named rows
// sharing the same section.
function _renderCustomRowSection(def, container) {
  const rows = customRowsFor(def.id).filter(
    (row) => cfg.slots[row.sid] || editMode,
  );
  if (!rows.length && !editMode) return;

  const list = el("div", "custom-rows-list");
  list.dataset.cardId = def.id;

  rows.forEach((row, idx) => {
    const elem = _buildSrRow(row, withAlpha(cssVar("--txt-dim"), 0.45));
    if (editMode) {
      const grip = el("button", "row-grip");
      grip.type = "button";
      grip.title = "Drag to reorder";
      grip.innerHTML =
        '<svg viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg>';
      elem.insertBefore(grip, elem.firstChild);

      const more = el("button", "assign-badge row-more");
      more.textContent = "⋯";
      more.title = "Row options";
      more.onclick = (e) => {
        e.stopPropagation();
        const items = [];
        // Style picker goes first — same position as the built-in row
        // menu (_hardRowMenu) so the segmented control always lands in
        // the same spot instead of drifting between "Rename" and
        // "Change sensor" depending on which row you're on.
        const seg = _styleSegItem(row);
        if (seg) items.push(seg);
        items.push({
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
        });
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
        // Drag the grip to reorder — up/down stay as a no-mouse fallback
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
    list.appendChild(elem);
  });

  container.appendChild(list);

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

function showScreen(id) {
  ["s-setup", "s-dash"].forEach((s) =>
    document.getElementById(s).classList.toggle("hide", s !== id),
  );
  // Always close picker when changing screens
  closePicker();
  // Re-measure content height for whichever screen is now visible —
  // setup/connecting screens autosize just as much as the dashboard.
  requestAnimationFrame(() => autoResize());
}

// Toggles between the full connect form and the compact connecting
// panel within #s-setup. Kept separate from showScreen() since both
// panels live inside the same "s-setup" screen.
function showConnectPanel(connecting) {
  document.getElementById("setup-form")?.classList.toggle("hide", connecting);
  document.getElementById("connect-wrap")?.classList.toggle("hide", !connecting);
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
//  GTK BRIDGE
// ═══════════════════════════════════════════════════════════════
function gtksend(msg) {
  try {
    window.webkit.messageHandlers.ccm.postMessage(msg);
  } catch {}
}

document.getElementById("bb-x").onclick = () => gtksend("close");
document.getElementById("bb-mini-all").onclick = () => {
  if (!editMode) toggleAllCardsMini();
};
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
    showScreen("s-dash");

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
  document.getElementById("sdot").className = "sdot " + cls;
  document.getElementById("stxt").textContent =
    cls === "ok" ? "Live" : cls === "err" ? msg : msg || "…";
  if (cls === "ok") {
    if (!_connectTime) _connectTime = Date.now();
    const up = document.getElementById("sbar-uptime");
    if (up) up.textContent = _fmtUptime(Date.now() - _connectTime);
  }
  // A failed attempt during the initial boot connect means the daemon
  // isn't reachable — surface the retry/cancel panel right away instead
  // of leaving the user staring at the boot screen until it retries into
  // eternity (the failsafe timer is just a backstop for this).
  if (cls === "err" && phase === "connecting") hideBootScreen();
  const cw = document.getElementById("connect-wrap");
  if (cw && !cw.classList.contains("hide")) {
    const title = document.getElementById("connect-title");
    const sub = document.getElementById("connect-sub");
    if (title) title.textContent = cls === "err" ? "Having trouble…" : "Connecting…";
    if (sub && msg) sub.textContent = msg;
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
//  STARTUP / BOOT UI
// ═══════════════════════════════════════════════════════════════

const BOOT_MIN_TIME = 450;

// How long to hold the finished dashboard on screen — fully resized,
// "Online" showing — before the boot screen starts fading. Gives the
// user a beat to actually register it instead of having it flicker past.
const BOOT_READ_DELAY = 2000;

const bootStarted = {};

// Resolves once the first Linux stats sample has arrived (or we give up
// waiting, e.g. psutil isn't installed). Python's stats push runs on its
// own independent 2s timer, unrelated to the SSE connection — boot can't
// safely take its "final" measurement until both are in.
let _resolveLinuxStatsReady;
const linuxStatsReady = new Promise((resolve) => {
  _resolveLinuxStatsReady = resolve;
});
setTimeout(() => _resolveLinuxStatsReady?.(), 3000);

// Order of the boot checklist and the progress-bar percentage the fill
// jumps to as each step goes active / completes. Kept as one table so the
// bar and the checklist can never drift out of sync with each other.
const BOOT_PROGRESS = {
  profile: { active: 8, done: 28 },
  theme: { active: 34, done: 52 },
  daemon: { active: 58, done: 82 },
  live: { active: 86, done: 100 },
};

function _setBootProgress(pct) {
  const fill = document.getElementById("boot-progress-fill");
  if (fill) fill.style.width = pct + "%";
}

function bootStep(name, state = "active") {
  const el = document.getElementById("boot-step-" + name);
  const pct = BOOT_PROGRESS[name]?.[state];
  if (pct !== undefined) _setBootProgress(pct);
  if (!el) return;

  el.classList.remove("active", "done", "error");
  el.classList.add(state);

  if (state === "active") {
    bootStarted[name] = performance.now();
  }
}

function bootState(text) {
  const el = document.getElementById("boot-state");
  if (el) el.textContent = text.toUpperCase();
}

// Marks a step "done", holding it "active" for at least BOOT_MIN_TIME so
// fast synchronous steps (loading config, applying a theme) don't just
// blip past — every step gets a moment to actually register on screen.
// callback is optional; waitBootStep() below wraps this as a promise for
// the common case of awaiting a step before starting the next one.
function bootStepDone(name, callback) {
  const started = bootStarted[name] ?? performance.now();
  const elapsed = performance.now() - started;
  const remaining = Math.max(0, BOOT_MIN_TIME - elapsed);

  setTimeout(() => {
    bootStep(name, "done");
    callback?.();
  }, remaining);
}

function waitBootStep(name) {
  return new Promise((resolve) => bootStepDone(name, resolve));
}

// How long the boot screen is allowed to sit on screen before it gets
// dismissed unconditionally. Covers the case where a returning user's
// daemon never answers (SSE just retries forever) — without this the
// boot screen would otherwise hang over the connect/retry panel forever
// with no way for the user to reach it.
const BOOT_FAILSAFE_MS = 8000;
let _bootHidden = false;
let _bootFailsafeTimer = null;

function hideBootScreen() {
  if (_bootHidden) return;
  _bootHidden = true;
  clearTimeout(_bootFailsafeTimer);

  const boot = document.getElementById("boot-screen");
  if (!boot) return;

  let settled = false;
  let fallbackTimer = null;

  const reveal = () => {
    if (settled) return;
    settled = true;
    clearTimeout(fallbackTimer);
    window.__onResizeApplied = null;
    // Two real animation frames so the browser has actually painted a
    // settled frame at the new size before the fade starts.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        boot.classList.add("hide");
        setTimeout(() => boot.remove(), 450);
      });
    });
  };

  // Python calls this the instant GTK's configure-event confirms the
  // native window has actually reached its target size (see
  // on_window_configure() in launch.py) — a real signal instead of a
  // guessed delay. The fallback timer is just a backstop for an older
  // launch.py that doesn't send it, or the rare case it's dropped.
  window.__onResizeApplied = reveal;
  fallbackTimer = setTimeout(reveal, 400);

  autoResize(true);
}

// ═══════════════════════════════════════════════════════════════
//  SETUP SCREEN
// ═══════════════════════════════════════════════════════════════
// Clears all local config (token, theme, layout, everything) and reloads
// as a brand-new install. Shared by the first-run setup screen's button
// and the settings drawer's "Danger Zone" — same action, same confirm,
// reachable from wherever the user happens to be.
function resetWidget() {
  if (!confirm("Clear saved CoolerControl settings and token?")) return;
  localStorage.clear();
  location.reload();
}

function initSetup() {
  phase = "setup";
  stopSSE();
  showConnectPanel(false);
  document.getElementById("i-url").value = cfg.baseUrl;
  document.getElementById("i-tok").value = cfg.token;
  const btn = document.getElementById("btn-connect");
  btn.textContent = "Connect";
  btn.disabled = false;
  _connectTime = 0;
  const _upEl = document.getElementById("sbar-uptime");
  if (_upEl) _upEl.textContent = "";
  showScreen("s-setup");

  const attemptConnect = () => {
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
    document.getElementById("connect-title").textContent = "Connecting…";
    document.getElementById("connect-sub").textContent =
      "Reaching " + (cfg.baseUrl || "CoolerControl");
    showConnectPanel(true);
    startSSE();
    // Note: Linux stats are pushed by Python automatically — no polling needed here
  };
  btn.onclick = attemptConnect;

  document.getElementById("btn-connect-cancel").onclick = () => {
    stopSSE();
    phase = "setup";
    btn.textContent = "Connect";
    btn.disabled = false;
    showConnectPanel(false);
  };

  // Returning user — a token's already saved, so skip straight to
  // the compact connecting panel instead of flashing the empty form.
  if (cfg.token) attemptConnect();
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
    titleEl.textContent =
      "Add Row — " + (cardMeta ? cardLabel(cardMeta) : newRowCard);
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

        row.innerHTML = `<span class="picker-leaf-name">${esc(leaf.sensorName ?? leaf.name)}</span>
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
//  THEME BUILDER — color pickers that write :root CSS live to the
//  active theme. Exposed below so theme-tile clicks can resync them.
// ═══════════════════════════════════════════════════════════════
let _tbSync = null;
let _tbGenerateCSS = null;
let _tbSetVar = null;

function initThemeBuilder() {
  if (document.getElementById("drawer")._wired) return;
  document.getElementById("drawer")._wired = true;

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
  // Accent colors (--cpu/--gpu/etc.) have no drawer UI of their own —
  // they're edited per-card via the header "⋯" popover (see _tbSetVar
  // below) — so bv tracks them only as inputs to generateCSS().
  function syncUIFromBv() {
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
  document.querySelectorAll('input[type="color"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const varName = e.target.dataset.var;
      bv[varName] = e.target.value;

      // Update the parent swatch / pip
      const parent = e.target.closest(".tb-swatch,.tb-warn-pip");
      if (parent) {
        parent.style.background = e.target.value;
      }

      // Update hex readout
      const key = varName.replace(/^--/, "");
      const hx = document.getElementById("tbh-" + key);
      if (hx) hx.textContent = e.target.value;

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
  // Lets a card-header "…" color popover change one accent var without
  // reverting the rest of the active theme to whatever the builder's
  // buffer last held — resync from the live theme first, then apply
  // just the one change on top of it.
  _tbSetVar = function (varName, hex) {
    syncBuilderFromActive();
    bv[varName] = hex;
    syncUIFromBv();
    liveApply();
  };

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

  // ── Anchor corner ────────────────────────────────────────────
  const ag = document.getElementById("anchor-grid");
  ag.innerHTML = "";
  const CORNERS = [
    { key: "top-left", dot: "tl", lbl: "Top Left" },
    { key: "top-right", dot: "tr", lbl: "Top Right" },
    { key: "bottom-left", dot: "bl", lbl: "Bottom Left" },
    { key: "bottom-right", dot: "br", lbl: "Bottom Right" },
  ];
  for (const c of CORNERS) {
    const btn = el("button", "anchor-btn");
    btn.dataset.corner = c.key;
    btn.title = c.key.replace("-", " ");
    if (cfg.anchorCorner === c.key) btn.classList.add("active");
    const icon = el("div", "anchor-icon");
    icon.appendChild(el("div", "anchor-dot " + c.dot));
    btn.appendChild(icon);
    const lbl = el("span", "anchor-lbl");
    lbl.textContent = c.lbl;
    btn.appendChild(lbl);
    btn.onclick = () => setAnchorCorner(c.key);
    ag.appendChild(btn);
  }

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

function barText(used, total) {
  if (typeof used !== "number" || typeof total !== "number") return "--";
  return `${fmtGB(used)}/${fmtGB(total)} GB`;
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD — card definitions
// ═══════════════════════════════════════════════════════════════

// ── Card type reference ──────────────────────────────────────────
//  "spark"  — canvas + rows. sparkKey picks the series a row feeds;
//             dynamicNorm:true auto-scales Y instead of fixed 0-100;
//             noPlot:true shows the value but skips the chart.
//  "sensor" — rows only, no canvas.
//  Rows with pctSid render as bar-rows, else sr rows. Every card also
//  accepts custom rows (cfg.customRows) — see customRowsFor().
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
    id: "case",
    lbl: "CHASSIS",
    cls: "fan",
    type: "spark",
    rows: [
      {
        sid: "case_temp",
        lbl: "AMB",
        mode: "warn",
        sparkKey: "temp",
        typeFilter: ["temp"],
      },
      {
        // Not a real sensor slot — averages duty% across whichever
        // custom rpm-type rows the user has added to this card.
        // See _chassisFanAvg().
        sid: "case_fan_avg",
        lbl: "FAN AVG",
        mode: "meter",
        sparkKey: "fan",
        unit: "%",
        computedFanAvg: true,
      },
    ],
  },
  {
    // Storage: auto-generated from Linux disk data (no static slots).
    // Kept last so the plotted cards (CPU/GPU/MEMORY/NET/CHASSIS) sit
    // together, with the plot-less disk list trailing after them.
    id: "storage",
    lbl: "STORAGE",
    cls: "ssd",
    type: "sensor",
    autoDisks: true,
    rows: [],
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
  // Custom rows aren't in SLOTS — derive unit from the assigned slot
  // instead, or from row.unit for computed rows with no real slot.
  const unit = sd?.unit ?? cfg.slots[row.sid]?.unit ?? row.unit ?? "";
  const srow = el("div", "sr");
  srow.id = "sr-" + row.sid;
  srow.dataset.sid = row.sid;
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
  const label = row.lbl;
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

// Accent color + line-dash style for a spark-card row, by sparkKey.
// noPlot rows (context-only, not actually plotted) get a neutral dim
// accent instead — used by the non-autoLinux branch in buildCards().
function _sparkAccent(row, cardColor, fanLine, loadColor) {
  if (row.noPlot) return { accent: withAlpha(cssVar("--txt-dim"), 0.45), dash: "solid" };
  if (row.sparkKey === "fan") return { accent: fanLine, dash: "dotted" };
  if (row.sparkKey === "load") return { accent: loadColor, dash: "dashed" };
  return { accent: cardColor, dash: "solid" };
}

// Per-card sparkline toggle — cfg.sparkOff[cardId] === true means the card's
// canvas + plotted-row split are skipped and every row (built-in + custom)
// renders flat, the same way Storage's sensor-only rows do.
function isSparkEnabled(cardId) {
  return !cfg.sparkOff?.[cardId];
}
function setSparkEnabled(cardId, on) {
  cfg.sparkOff ??= {};
  if (on) delete cfg.sparkOff[cardId];
  else cfg.sparkOff[cardId] = true;
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// Per-card sparkline peak-marker toggle — used to live as a single global
// drawer setting, but peaks don't mean much on some series (an ambient
// case-temp sparkline's "session high" is just whatever the room did),
// so it's per-card now, same pattern as isSparkEnabled/setSparkEnabled.
function isPeakEnabled(cardId) {
  return !cfg.peakOff?.[cardId];
}
function setPeakEnabled(cardId, on) {
  cfg.peakOff ??= {};
  if (on) delete cfg.peakOff[cardId];
  else cfg.peakOff[cardId] = true;
  saveCfg();
  // Redraw immediately rather than waiting on the next data push — the
  // spark instance already exists, no need for a full buildCards().
  const spark = sparks[cardId];
  if (spark) {
    spark.showPeaks = on;
    spark.draw();
  }
}

// Manual per-card visibility override. Cards normally appear only when
// they have live/assigned data — this lets a card with autoLinux rows
// (which show themselves the moment Linux stats arrive, with no
// "clear assignment" escape hatch) be suppressed anyway. Hidden cards
// still render in edit mode, dimmed, with a "Show card" affordance —
// same show/hide-while-editing pattern as hidden Storage mounts.
function isCardHidden(cardId) {
  return !!cfg.cardHidden?.[cardId];
}
function setCardHidden(cardId, hidden) {
  cfg.cardHidden ??= {};
  if (hidden) cfg.cardHidden[cardId] = true;
  else delete cfg.cardHidden[cardId];
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// Per-card "mini" collapse — shrinks the whole card down to just its
// header row (title + a few headline numbers + a severity pill), body
// hidden. Purely a viewing-density preference, so toggling is cheap:
// no buildCards() rebuild, just a class flip + resize — the card's
// canvas/spark instance and its plotted history keep running
// underneath, unaffected, so expanding back is instant and gap-free.
// Forced off while editing (see buildCards()) since a collapsed card
// hides every affordance you'd need to reconfigure it.
function isCardMini(cardId) {
  return !!cfg.cardMini?.[cardId];
}
function setCardMini(cardId, mini) {
  cfg.cardMini ??= {};
  if (mini) cfg.cardMini[cardId] = true;
  else delete cfg.cardMini[cardId];
  saveCfg();
  const card = document.getElementById("card-" + cardId);
  if (card) card.classList.toggle("mini", mini);
  const btn = document.getElementById("mini-tog-" + cardId);
  if (btn) {
    btn.innerHTML = mini ? _ICON_CHEVRON_DOWN : _ICON_CHEVRON_UP;
    btn.title = mini ? "Expand" : "Collapse";
  }
  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}

// Bulk collapse/expand — what used to be the taskbar-minimize button
// (not much use in a borderless widget with no taskbar affordance).
// One state mutation + one DOM/save pass rather than looping
// setCardMini() per card, so it stays a single localStorage write.
function toggleAllCardsMini() {
  const ids = orderedCardDefs()
    .map((d) => d.id)
    .filter((id) => document.getElementById("card-" + id) && !isCardHidden(id));
  if (!ids.length) return;
  const next = !ids.every((id) => isCardMini(id));
  cfg.cardMini ??= {};
  for (const id of ids) {
    if (next) cfg.cardMini[id] = true;
    else delete cfg.cardMini[id];
    const card = document.getElementById("card-" + id);
    if (card) card.classList.toggle("mini", next);
    const btn = document.getElementById("mini-tog-" + id);
    if (btn) {
      btn.innerHTML = next ? _ICON_CHEVRON_DOWN : _ICON_CHEVRON_UP;
      btn.title = next ? "Expand" : "Collapse";
    }
  }
  saveCfg();
  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}

// Keeps the sbar "collapse/expand all" icon honest — e.g. if the user
// collapses cards one by one until every visible card happens to be
// mini, the button should already read "Expand all" without needing
// its own click first.
function _updateMiniAllBtn() {
  const btn = document.getElementById("bb-mini-all");
  if (!btn) return;
  const ids = orderedCardDefs()
    .map((d) => d.id)
    .filter((id) => document.getElementById("card-" + id) && !isCardHidden(id));
  const allMini = ids.length > 0 && ids.every((id) => isCardMini(id));
  btn.innerHTML = allMini ? _ICON_CHEVRON_ALL_DOWN : _ICON_CHEVRON_ALL_UP;
  btn.title = allMini ? "Expand all" : "Collapse all";
}

// Short (≤4 char) labels for the mini row's headline numbers — the
// full row.lbl ("FAN AVG", "↓ RX") is too wide for a single collapsed
// line. Falls back to a stripped/truncated version of row.lbl for
// anything not listed here (e.g. a future card's rows).
// Fixed column count for the mini row grid — every card pads to (or
// truncates at) this many slots so values line up across cards once
// several are collapsed and stacked (see the render loop in
// renderDashboard). 3 comfortably covers every card today (CPU/GPU use
// all 3; MEMORY, NET, CHASSIS, and STORAGE use 2).
const MINI_SLOTS = 3;

const MINI_LBL = {
  cpu_temp: "T",
  cpu_load: "L",
  cpu_fan: "F",
  gpu_temp: "T",
  gpu_load: "L",
  gpu_fan: "F",
  lnx_ram_pct: "RAM",
  lnx_swap_pct: "SWP",
  lnx_net_rx: "RX",
  lnx_net_tx: "TX",
  case_temp: "AMB",
  case_fan_avg: "FAN",
};
function _miniLbl(row) {
  return (
    MINI_LBL[row.sid] ||
    (row.lbl || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() ||
    "—"
  );
}
// Compact unit suffix appended straight onto the number — only for
// symbols short enough not to blow out a 58px slot (°, %). Anything
// wordier (RPM, KB/s, W) is skipped; the abbreviated label already
// gives enough context (e.g. "F" for fan implies RPM).
function _miniUnitSuffix(unit) {
  if (unit === "°C") return "°";
  if (unit === "%") return "%";
  return "";
}

// Gathers up to 3 headline {lbl, str, bar, full} values for a card's
// collapsed mini row. `full` is the un-abbreviated row label, shown as
// a hover tooltip since "T"/"SWP"/"AMB" aren't self-explanatory on
// first sight. `bar` is always a CSS color — warn-mode metrics
// (temp/load) get the graduated --w1..--w5 severity ramp; everything
// else (fan, RX/TX, Storage's summary) gets a flat on/off read using
// the same --meter / --dot-off-meter convention the full-view meter
// dots already use (see makeDots) — not a severity signal, just "is
// there something happening here", so every slot reads consistently
// instead of some having a bar and others leaving a gap.
// Spark-type cards just read their own row.sid values (already
// exactly what the full view shows — temp/load/fan, RAM/SWAP,
// RX/TX, etc). Storage has no fixed rows (auto-generated per disk), so
// it gets a bespoke summary instead: busiest visible disk + a count.
function _miniHeadline(def, devices) {
  const items = [];
  const meterBar = (v) =>
    typeof v === "number" && v > 0 ? "var(--meter)" : "var(--dot-off-meter)";
  const warnBar = (lvl) => (lvl > 0 ? `var(--w${lvl})` : "var(--dot-off-warn)");

  if (def.autoDisks) {
    const linuxDev = devices.find((d) => d.uid === "linux-system");
    const lat = getLatest(linuxDev);
    const diskChs =
      lat?.channels?.filter((ch) => /^Disk .+ Usage$/.test(ch.name)) ?? [];
    const visible = diskChs.filter((ch) => {
      const mount = ch.name.replace(/^Disk /, "").replace(/ Usage$/, "");
      return !(cfg.hiddenMounts ?? []).includes(mount);
    });
    if (!visible.length) return items;
    const busiest = visible.reduce((a, b) =>
      (b.duty ?? 0) > (a.duty ?? 0) ? b : a,
    );
    const mount = busiest.name.replace(/^Disk /, "").replace(/ Usage$/, "");
    const mountLbl = mount === "/" ? "ROOT" : (mount.split("/").pop() || mount).toUpperCase();
    items.push({
      lbl: mountLbl.slice(0, 5),
      str: Math.round(busiest.duty ?? 0) + _miniUnitSuffix("%"),
      bar: meterBar(busiest.duty),
      full: mount === "/" ? "Root — busiest disk" : `${mount} — busiest disk`,
    });
    if (visible.length > 1) {
      items.push({
        lbl: "DISKS",
        str: String(visible.length),
        bar: meterBar(visible.length),
        full: "Visible disks",
      });
    }
    return items;
  }
  for (const row of def.rows || []) {
    if (row.computedFanAvg) {
      const avg = _chassisFanAvg(devices);
      if (avg !== undefined)
        items.push({
          lbl: _miniLbl(row),
          str: fmt1(avg, "%") + _miniUnitSuffix("%"),
          bar: meterBar(avg),
          full: row.lbl,
        });
      continue;
    }
    const slot = cfg.slots[row.sid];
    if (!slot) continue;
    const v = getSlotValue(devices, slot);
    if (v === undefined) continue;
    const sd2 = SLOTS.find((s) => s.id === row.sid);
    const unit = sd2?.unit ?? row.unit ?? "";
    const bar =
      row.mode === "warn" ? warnBar(warnLevel(row.sid, v)) : meterBar(getFanDuty(devices, slot) ?? v);
    items.push({
      lbl: _miniLbl(row),
      str: fmt1(v, unit) + _miniUnitSuffix(unit),
      bar,
      full: row.lbl,
    });
  }
  return items.slice(0, 3);
}

// Per-card display-label override — mirrors the rename affordance custom
// rows already have; built-in card titles (CPU/GPU/etc.) couldn't be
// touched before this.
function cardLabel(def) {
  return cfg.cardLabels?.[def.id] || def.lbl;
}
function setCardLabel(cardId, label) {
  cfg.cardLabels ??= {};
  const def = CARD_DEFS.find((d) => d.id === cardId);
  const trimmed = (label || "").trim();
  if (trimmed && trimmed !== def?.lbl) cfg.cardLabels[cardId] = trimmed;
  else delete cfg.cardLabels[cardId];
  saveCfg();
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}

// Applies the user's saved drag order to CARD_DEFS — same pattern as
// customRowsFor()/rowOrder for custom rows. Cards not yet in the saved
// order (e.g. freshly relevant after a new assignment) fall in at the end.
function orderedCardDefs() {
  const order = cfg.cardOrder;
  if (!order || !order.length) return CARD_DEFS;
  const byId = new Map(CARD_DEFS.map((d) => [d.id, d]));
  const out = [];
  for (const id of order) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
    }
  }
  out.push(...byId.values());
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  CARD REORDERING — drag via header grip, edit-mode only.
//  Manual pointer-based sort (not native HTML5 DnD) so the drag
//  feedback stays consistent with the rest of the app's chrome.
// ═══════════════════════════════════════════════════════════════
function _persistCardOrder() {
  cfg.cardOrder = [...document.querySelectorAll("#cards > .card")].map((c) =>
    c.id.replace(/^card-/, ""),
  );
  saveCfg();
}

function _cardDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".card:not(.dragging)")];
  let closest = { offset: -Infinity, element: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}

function initCardSort() {
  const container = document.getElementById("cards");
  let dragEl = null;

  container.addEventListener("mousedown", (e) => {
    if (!editMode) return;
    const grip = e.target.closest(".card-grip");
    if (!grip) return;
    dragEl = grip.closest(".card");
    if (!dragEl) return;
    e.preventDefault();
    dragEl.classList.add("dragging");

    const onMove = (e2) => {
      const after = _cardDragAfterElement(container, e2.clientY);
      if (after == null) container.appendChild(dragEl);
      else container.insertBefore(dragEl, after);
    };
    const onUp = () => {
      dragEl.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _persistCardOrder();
      dragEl = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOM-ROW REORDERING — drag via row grip, edit-mode only.
//  Same manual pointer-based pattern as card reordering above,
//  scoped to whichever .custom-rows-list wrapper the grip lives in
//  so a drag never mixes with disk/named rows sharing that section.
// ═══════════════════════════════════════════════════════════════
function _persistCustomRowOrder(cardId, list) {
  cfg.rowOrder ??= {};
  cfg.rowOrder[cardId] = [...list.querySelectorAll(":scope > .sr")].map(
    (r) => r.dataset.sid,
  );
  saveCfg();
}

function _rowDragAfterElement(list, y) {
  const els = [...list.querySelectorAll(".sr:not(.dragging)")];
  let closest = { offset: -Infinity, element: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}

function initRowSort() {
  const container = document.getElementById("cards");
  let dragEl = null;

  container.addEventListener("mousedown", (e) => {
    if (!editMode) return;
    const grip = e.target.closest(".row-grip");
    if (!grip) return;
    const list = grip.closest(".custom-rows-list");
    dragEl = grip.closest(".sr");
    if (!dragEl || !list) return;
    e.preventDefault();
    dragEl.classList.add("dragging");

    const onMove = (e2) => {
      const after = _rowDragAfterElement(list, e2.clientY);
      if (after == null) list.appendChild(dragEl);
      else list.insertBefore(dragEl, after);
    };
    const onUp = () => {
      dragEl.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _persistCustomRowOrder(list.dataset.cardId, list);
      buildCards();
      renderDashboard(liveDevices);
      requestAnimationFrame(() => autoResize());
      dragEl = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
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

  for (const def of orderedCardDefs()) {
    // Manual hide overrides everything except edit mode, where a hidden
    // card still renders (dimmed) so there's a way back to "Shown".
    if (isCardHidden(def.id) && !editMode) continue;

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
    const hidden = isCardHidden(def.id);
    if (hidden) card.classList.add("card-hidden-preview");
    const mini = isCardMini(def.id) && !editMode;
    card.classList.toggle("mini", mini);
    // While hidden, the badge is the only affordance — no separate "⋯"
    // menu competing for the same job (and nothing else in that menu is
    // worth exposing on a card you've just taken out of the layout).
    card.innerHTML = `<div class="card-hdr ${def.cls}" id="hdr-${def.id}">${
      editMode
        ? '<button class="card-grip" title="Drag to reorder" type="button"><svg viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg></button>'
        : ""
    }<span class="card-ttl">${esc(cardLabel(def))}</span>
    <span class="card-mini-vals" id="mini-${def.id}"></span>${
      hidden
        ? '<button class="card-hidden-badge" type="button" title="Click to unhide">Hidden</button>'
        : ""
    }${
      editMode && !hidden
        ? '<button class="card-more" title="Card options" type="button">⋯</button>'
        : ""
    }${
      !editMode && !hidden
        ? `<button class="card-mini-toggle" id="mini-tog-${def.id}" title="${mini ? "Expand" : "Collapse"}" type="button">${mini ? _ICON_CHEVRON_DOWN : _ICON_CHEVRON_UP}</button>`
        : ""
    }</div>`;
    c.appendChild(card);

    if (!editMode && !hidden) {
      const miniBtn = card.querySelector(".card-mini-toggle");
      miniBtn.onclick = (e) => {
        e.stopPropagation();
        setCardMini(def.id, !isCardMini(def.id));
      };
      // Whole header toggles, not just the chevron — a tiny 18px button
      // is a fussy target on a widget this size. The tooltip spans
      // inside .card-mini-vals still get their own hover title; a click
      // anywhere else in the header (including on them) just toggles.
      const hdrEl = card.querySelector(".card-hdr");
      hdrEl.classList.add("card-hdr-toggleable");
      hdrEl.onclick = () => setCardMini(def.id, !isCardMini(def.id));
    }

    const hiddenBadge = card.querySelector(".card-hidden-badge");
    if (hiddenBadge) {
      hiddenBadge.onclick = (e) => {
        e.stopPropagation();
        setCardHidden(def.id, false);
      };
    }

    if (editMode && !hidden) {
      const moreBtn = card.querySelector(".card-more");
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        const varName = "--" + def.cls;
        const current = cssVar(varName) || "#888888";
        const items = [
          {
            type: "color",
            label: cardLabel(def) + " color",
            value: current,
            onChange: (hex) => {
              if (_tbSetVar) _tbSetVar(varName, hex);
            },
          },
        ];
        if (def.type === "spark") {
          items.push({
            type: "segmented",
            current: isSparkEnabled(def.id) ? "on" : "off",
            options: [
              { value: "on", label: "Chart", title: "Show plotted sparkline" },
              { value: "off", label: "Rows", title: "Show as plain sensor rows, no chart" },
            ],
            onSelect: (v) => setSparkEnabled(def.id, v === "on"),
          });
          items.push({
            type: "segmented",
            current: isPeakEnabled(def.id) ? "on" : "off",
            options: [
              { value: "on", label: "Peaks", title: "Mark each series' session-high on the chart" },
              { value: "off", label: "No peaks", title: "Hide the peak markers on this card" },
            ],
            onSelect: (v) => setPeakEnabled(def.id, v === "on"),
          });
        }
        items.push({
          label: "Rename",
          onClick: () => {
            const nl = prompt("Card name:", cardLabel(def));
            if (nl !== null) setCardLabel(def.id, nl);
          },
        });
        // Unhiding happens by clicking the "Hidden" badge directly on the
        // card (this menu doesn't even render while hidden — see above),
        // so there's no redundant "un-hide" entry to maintain here.
        items.push({
          label: "Hide card",
          danger: true,
          onClick: () => setCardHidden(def.id, true),
        });
        _openRowMenu(moreBtn, items);
      };
    }

    const cardColor = cssVar("--" + def.cls);
    const fanColor = cssVar("--fan");
    const loadColor = withAlpha(cardColor, 0.55);
    const fanLine = def.cls === "fan" ? cardColor : fanColor;

    // ── spark ─────────────────────────────────────────────────
    if (def.type === "spark") {
      const sparkOn = isSparkEnabled(def.id);
      let body, rcol, ctxBody;

      if (sparkOn) {
        body = el("div", "card-spark");
        card.appendChild(body);

        const scol = el("div", "spark-col");
        body.appendChild(scol);
        const {
          canvas: { w: CW, h: CH },
        } = SIZES[cfg.size] || SIZES.s;
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
          showPeaks: isPeakEnabled(def.id),
        });
        for (const r of def.rows) {
          if (r.dynamicNorm) sparks[def.id].setDynamic(r.sparkKey, true);
        }

        rcol = el("div", "card-rows");
        body.appendChild(rcol);

        // ── Context section (noPlot + custom rows) ────────────────
        // Built separately and appended below the spark grid so it's
        // visually unambiguous what is plotted vs what is context.
        ctxBody = el("div", "card-spark-ctx");
      } else {
        // Sparkline off — no canvas, no plotted/context split. Every
        // row (built-in + custom) renders flat, same visual language
        // as a "sensor"-type card like Storage.
        body = el("div", "card-rows-full");
        card.appendChild(body);
        rcol = body;
        ctxBody = body;
      }

      for (const row of def.rows) {
        if (row.computedFanAvg) {
          if (!_chassisFanRows().length && !editMode) continue;
          const { accent, dash } = sparkOn
            ? _sparkAccent(row, cardColor, fanLine, loadColor)
            : { accent: cardColor, dash: "solid" };
          rcol.appendChild(_buildSrRow(row, accent, dash));
          continue;
        }
        if (row.autoLinux) {
          if (!cfg.slots[row.sid] && !linuxHasData) continue;
          const { accent, dash } = sparkOn
            ? _sparkAccent(row, cardColor, fanLine, loadColor)
            : { accent: cardColor, dash: "solid" };
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
        const { accent, dash } = sparkOn
          ? _sparkAccent(row, cardColor, fanLine, loadColor)
          : { accent: cardColor, dash: "solid" };
        const elem =
          getRowStyle(row) === "bar"
            ? _buildBarRow(row, accent, dash)
            : _buildSrRow(row, accent, dash);
        if (editMode) _hardRowMenu(elem, row);
        // noPlot rows go in the context section below the spark grid —
        // when the sparkline is off, ctxBody === rcol, so this is a no-op
        if (sparkOn && row.noPlot) {
          ctxBody.appendChild(elem);
        } else {
          rcol.appendChild(elem);
        }
      }

      // Custom rows always live in the context section (== body when flat)
      _renderCustomRowSection(def, ctxBody);

      // Only attach ctxBody separately if it has visible children and it
      // isn't already `body` (which was appended above in flat mode)
      if (sparkOn && ctxBody.childElementCount > 0) {
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
          const mountLbl =
            mount === "/" ? "root" : mount.split("/").pop() || mount;
          // usedSid/totalSid just need to be truthy here to get the
          // "used/total" sub-span rendered — real values are filled in
          // by the renderDashboard() pass that always follows buildCards().
          const srow = _buildBarRow(
            { sid: safeId, lbl: mountLbl, usedSid: true, totalSid: true },
            cardColor,
          );
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

      // Named rows — currently unused by any "sensor"-type card (Storage
      // is autoDisks-only with rows:[]), kept generic for whatever the
      // next sensor-type card needs. Not drag-reorderable — only custom
      // rows are (see .custom-rows-list / initRowSort()).
      for (const row of def.rows || []) {
        const assigned = cfg.slots[row.sid];
        if (!row.autoLinux && !assigned && !editMode) continue;
        const elem =
          getRowStyle(row) === "bar"
            ? _buildBarRow(row, cardColor)
            : _buildSrRow(row, cardColor);
        if (editMode) _hardRowMenu(elem, row);
        body.appendChild(elem);
      }
      _renderCustomRowSection(def, body);
    }
  }

  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-RESIZE
//  Measures true card content height and notifies Python so the
//  GTK window snaps to fit — no scroll, no dead space.
// ═══════════════════════════════════════════════════════════════
const DRAWER_W = 320; // matches #drawer's fixed width in monitor.css
const SETUP_W = 340; // compact width for the setup/connecting screens

function autoResize(force = false) {
  const boot = document.getElementById("boot-screen");
  if (!force && boot && !boot.classList.contains("hide")) {
    return;
  }

  const sbarH = document.getElementById("sbar").offsetHeight;
  const borders = 2; // #app top + bottom border

  // Setup / connecting screens — compact, content-driven sizing so a
  // returning user (auto-connecting) or someone still typing in a
  // token never sees the tall dashboard-sized window before there's
  // any dashboard content to justify it.
  if (document.getElementById("s-dash").classList.contains("hide")) {
    const connectWrap = document.getElementById("connect-wrap");
    const panel =
      connectWrap && !connectWrap.classList.contains("hide")
        ? connectWrap
        : document.getElementById("setup-form");
    if (!panel) return;
    const screenPad = 24; // .screen { padding: 12px } × 2 sides
    const h = panel.scrollHeight + screenPad + sbarH + borders;
    gtksend("resize:" + SETUP_W + ":" + h);
    return;
  }

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

// ═══════════════════════════════════════════════════════════════
//  RENDER DASHBOARD
// ═══════════════════════════════════════════════════════════════

function renderDashboard(devices, { pushSparks = false } = {}) {
  // Per-card rollup for the header alert bar — reset every tick and
  // filled in as rows are walked below (named rows + custom rows).
  // Only "warn"-mode severity counts; meter-mode (fan duty) is
  // intensity, not a problem signal. Storage is excluded entirely —
  // disk fullness isn't the kind of "something's wrong" this is for.
  const cardAlert = {};
  const bumpAlert = (cardId, lvl) => {
    if (typeof lvl !== "number") return;
    cardAlert[cardId] = Math.max(cardAlert[cardId] ?? 0, lvl);
  };

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
      if (v !== undefined) {
        const lvl =
          row.mode === "warn"
            ? warnLevel(row.sid, v)
            : dutyLevel(getFanDuty(devices, slot));
        if (sd) {
          sd.innerHTML = makeDots(
            lvl,
            getRowStyle(row) === "dots-meter" ? "meter" : "warn",
          );
        }
        if (row.mode === "warn") bumpAlert(def.id, lvl);
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
    // Text/dot readouts above already update on every call (SSE
    // arrival, Linux stats push, etc. — irregular cadence). Actually
    // appending a new point to the plotted history only happens when
    // pushSparks is set, i.e. from the fixed 1 Hz ticker below — so
    // every plotted pixel-step represents exactly one real second,
    // instead of one step per (irregularly-timed) data event.
    const spark = sparks[def.id];
    if (!spark || !def.rows) continue;

    if (def.type === "spark") {
      if (pushSparks) spark.tick();
      for (const row of def.rows) {
        if (row.computedFanAvg) {
          const avg = _chassisFanAvg(devices);
          const sv = document.getElementById("sv-" + row.sid);
          const sd = document.getElementById("sd-" + row.sid);
          if (sv) sv.textContent = fmt1(avg, "%");
          if (avg !== undefined) {
            const lvl = dutyLevel(avg);
            if (sd) {
              sd.innerHTML = makeDots(
                lvl,
                getRowStyle(row) === "dots-meter" ? "meter" : "warn",
              );
            }
            if (pushSparks) {
              spark.setFanNorm(100);
              spark.push("fan", avg);
            }
          }
          _trackPeak(row.sid, avg);
          _updatePeakTip(row.sid, "%");
          continue;
        }
        if (!pushSparks) continue; // nothing else in this branch is spark-only
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
  for (const [cardId, rows] of Object.entries(cfg.customRows ?? {})) {
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
      if (v !== undefined) {
        const lvl =
          row.mode === "warn"
            ? warnLevel(row.sid, v)
            : dutyLevel(getFanDuty(devices, slot));
        if (sd) {
          sd.innerHTML = makeDots(
            lvl,
            getRowStyle(row) === "dots-meter" ? "meter" : "warn",
          );
        }
        if (row.mode === "warn") bumpAlert(cardId, lvl);
      }
      _trackPeak(row.sid, v);
      _updatePeakTip(row.sid, unit);
    }
  }

  // ── Header alert bar (+ mini-row headline/dots) ────────────────
  // Silent through levels 1–3 (routine fluctuation) — only the top two
  // bands touch the card's own accent bar, and Storage never does.
  // Mini-row values are kept current on every pass regardless of
  // collapsed state, so toggling mini is an instant class flip.
  // Padded to a fixed 3 slots (see MINI_SLOTS) so a card with fewer
  // headline values than another still lines up column-for-column with
  // it once both are collapsed and stacked — a real grid, not just
  // each card's own cluster hugging the right edge at its own width.
  for (const def of CARD_DEFS) {
    const hdr = document.getElementById("hdr-" + def.id);
    if (!hdr) continue;

    const miniVals = document.getElementById("mini-" + def.id);
    if (miniVals) {
      const heads = _miniHeadline(def, devices);
      const slots = Array.from(
        { length: MINI_SLOTS },
        (_, i) => heads[i] ?? null,
      );
      miniVals.innerHTML = slots
        .map((it) => {
          if (!it) return `<span class="mini-val mini-val-empty"></span>`;
          return `<span class="mini-val" title="${esc(it.full)}"><span class="mini-bar" style="background:${it.bar}"></span><span class="mini-val-lbl">${esc(it.lbl)}</span><span class="mini-val-num">${esc(it.str)}</span></span>`;
        })
        .join("");
    }

    if (def.id === "storage") {
      hdr.classList.remove("hdr-warm", "hdr-hot");
      continue;
    }
    const lvl = cardAlert[def.id] ?? 0;
    hdr.classList.toggle("hdr-warm", lvl === 4);
    hdr.classList.toggle("hdr-hot", lvl >= 5);
  }
}

// ── Fixed-rate sparkline ticker ──────────────────────────────────
// The dashboard re-renders on every SSE packet and every 2 s Linux
// stats push — two independent, irregularly-interleaved sources.
// Sampling the sparkline history on that schedule made each plotted
// step cover a different, unpredictable slice of real time (some
// nearly back-to-back, some ~2 s apart), so the trace visibly
// kinked/trailed off instead of reading as a clean N-second window.
// Feeding the graphs from their own steady 1 s clock instead means
// every horizontal step is worth exactly one real second — see
// MultiSpark's MAX/BAR for how that maps to a clean 60 s window.
setInterval(() => {
  if (phase === "dashboard") renderDashboard(liveDevices, { pushSparks: true });
}, 1000);

// ═══════════════════════════════════════════════════════════════
//  MULTI-SERIES SPARKLINE — up to 3 series, drawn fan→load→temp so
//  temp sits on top: temp solid+fill, load dashed, fan dotted. Grid
//  lines at 25/50/75/100%; the line-style samples double as the
//  legend (no separate HTML strip).
// ═══════════════════════════════════════════════════════════════
class MultiSpark {
  constructor(canvas, { cardColor, loadColor, fanLine, W, H, dpr = 1, showPeaks = true } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
    this.showPeaks = showPeaks;
    this.MAX = 61; // data points kept — 60 one-second intervals = a clean 60s/1min window
    this.BAR = 10; // vertical marker every 10s — 60/10 divides evenly, no leftover at the edge

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
    // to .spark-col (position:relative) so they can spill past the
    // canvas's own border instead of being clipped to its bitmap.
    this.peakDots = {};
    const container = canvas.parentElement;
    for (const key of Object.keys(this.S)) {
      const dot = document.createElement("div");
      dot.className = "spark-peak-dot";
      dot.style.display = "none";
      container.appendChild(dot);
      this.peakDots[key] = dot;
    }

    // Wall-clock timestamps paralleling the data buffers, for an honest
    // time-horizon label (push cadence isn't perfectly regular).
    this.times = [];
  }

  // Call once per render tick (not per push) so the time-horizon label
  // reflects real elapsed time even when a card's series don't all
  // push on the same tick.
  tick() {
    this.times.push(Date.now());
    if (this.times.length > this.MAX) this.times.shift();
  }

  // Mark a series as auto-scaling — its norm re-derives from whatever
  // is actually in the visible window (×1.2 headroom), rather than
  // staying fixed at 100. Use for metrics with no natural 0–100
  // ceiling (e.g. network throughput in KB/s).
  setDynamic(key, dynamic = true) {
    const s = this.S[key];
    if (s) s.dynamic = dynamic;
  }
  setNorm(key, n) {
    const s = this.S[key];
    if (s) s.norm = n;
  }
  // Locks two dynamic series to one Y-scale (e.g. RX/TX) so their heights
  // stay comparable instead of each auto-scaling to its own peak.
  setSharedNorm(keys) {
    if (!Array.isArray(keys) || keys.length < 2) return;

    const values = [];

    for (const key of keys) {
      const s = this.S[key];
      if (!s) continue;
      values.push(...s.data);
    }

    const norm = Math.max(0.05, ...values) * 1.2;

    for (const key of keys) {
      const s = this.S[key];
      if (s) s.norm = norm;
    }
  }
  // Recomputed from the visible window every call (not a one-way
  // ratchet) so the scale shrinks back down once a spike scrolls out
  // of view, instead of small values staying pinned near the floor.
  trackMax(key, val) {
    const s = this.S[key];
    if (!s || typeof val !== "number" || isNaN(val)) return;
    const recentMax = Math.max(val, ...s.data);
    s.norm = Math.max(0.05, recentMax * 1.2);
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
    s.data.push(val);
    if (s.data.length > this.MAX) s.data.shift();
    if (s.dynamic) {
      this.trackMax(key, val);
      // RX/TX share one scale so their bars stay comparable.
      if (this.S.temp && this.S.load && key !== "fan") {
        this.setSharedNorm(["temp", "load"]);
      }
      // Peak tracks the windowed max (not all-time) so it always lands
      // within the currently-drawn scale; true all-time high still
      // shows via the row's hover tooltip.
      s.peak = Math.max(val, ...s.data);
    } else if (typeof peakOverride === "number") {
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

    // ── Horizontal gridlines ── alpha is fixed here (not themed) since
    // some themes' --spark-grid is too faint to read; midline is brighter.
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

      // Peak marker (DOM element, see constructor) — gated behind a
      // preference since not everyone wants the extra marks.
      const dot = this.peakDots[key];
      if (dot) {
        if (this.showPeaks && s.peak !== undefined) {
          dot.style.top = yOf(s.peak, s.norm) + "px";
          dot.style.background = s.color;
          dot.style.display = "block";
        } else {
          dot.style.display = "none";
        }
      }
    }

    // ── Time-horizon label — real elapsed span (push cadence isn't
    // perfectly regular), drawn on a scrim so it stays legible over
    // whatever's plotted near the floor.
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
// demo-gif.html loads this file with ?demo=1 and drives boot/config
// itself via window.__seedDemo()/__demoTick() — it needs the real
// boot sequence to stay completely out of the way (no boot-screen
// animation, and critically no applySize()/applyTheme() calls firing
// on their own timers and stomping the seeded dashboard mid-render).
const DEMO_MODE = new URLSearchParams(location.search).get("demo") === "1";

(async () => {
  if (DEMO_MODE) return;

  // Backstop: whatever happens above (daemon never answers, an unexpected
  // error, etc.), the boot screen is guaranteed to step aside eventually
  // rather than trap the user behind it. hideBootScreen() is idempotent,
  // so this is a no-op once boot finishes normally.
  _bootFailsafeTimer = setTimeout(hideBootScreen, BOOT_FAILSAFE_MS);

  // Lock the native window to the compact startup size.
  gtksend("boot");

  // ── Profile ──────────────────────────────────────────────────
  bootStep("profile", "active");
  bootState("Loading profile");

  loadCfg();

  await waitBootStep("profile");

  // ── Interface ────────────────────────────────────────────────
  bootStep("theme", "active");
  bootState("Preparing interface");

  initCardSort();
  initRowSort();

  applySize(cfg.size || "s", false);

  applyTheme(
    cfg.theme === "custom" ? "custom" : cfg.theme || "deep-space",
    cfg.theme === "custom" ? cfg.customThemeCSS : null,
  );

  await waitBootStep("theme");

  // Sync a previously-chosen anchor corner to Python (which persists
  // its own copy for resize math) and flip the bar-top layout — both
  // are no-ops for the common case of no corner chosen yet.
  if (cfg.anchorCorner) {
    document
      .getElementById("app")
      .classList.toggle(
        "bar-top",
        cfg.anchorCorner === "top-left" || cfg.anchorCorner === "top-right",
      );
    gtksend("anchor:" + cfg.anchorCorner);
  }

  document.getElementById("btn-reset").onclick = resetWidget;
  document.getElementById("btn-reset-drawer").onclick = resetWidget;

  // ── New user ─────────────────────────────────────────────
  // No daemon to reach yet, so the "daemon"/"live" checklist steps don't
  // apply — reveal the connect form directly instead of leaving them
  // stalled mid-checklist behind the boot screen.
  if (!cfg.token) {
    initSetup();
    hideBootScreen();
    return;
  }

  // ── Returning user ───────────────────────────────────────
  bootStep("daemon", "active");
  bootState("Connecting");

  initSetup();
})();
