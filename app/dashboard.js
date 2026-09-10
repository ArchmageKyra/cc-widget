/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — dashboard.js
   ────────────────────────────────────────────────────────────────────────────
   The core of the app: CARD_DEFS, buildCards(), card/row drag-reordering,
   renderDashboard(), and the MultiSpark sparkline renderer that feeds each
   card's canvas.
   Depends on: themes.js, state.js, ui-widgets.js (must load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

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

// Per-card header alert-pulse toggle — cfg.cardAlertOff[cardId] === true
// suppresses the hdr-warm/hdr-hot pulse no matter how bad a reading
// gets; the header's plain accent bar still shows, it just never
// flashes. Same per-card pattern as isSparkEnabled/isPeakEnabled.
// Applies to every card type (unlike Chart/Peaks, which are spark-only)
// since any card with a warn-mode row can accumulate an alert level.
function isCardAlertEnabled(cardId) {
  return !cfg.cardAlertOff?.[cardId];
}
function setCardAlertEnabled(cardId, on) {
  cfg.cardAlertOff ??= {};
  if (on) delete cfg.cardAlertOff[cardId];
  else cfg.cardAlertOff[cardId] = true;
  saveCfg();
  // hdr-warm/hdr-hot are recomputed fresh every render — no rebuild
  // needed, just force the next pass now instead of waiting on data.
  renderDashboard(liveDevices);
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

// Full dashboard rebuild: tears down and re-creates every card's DOM
// from CARD_DEFS + cfg (slots, custom rows, mini/hidden/order state).
// Called on any structural change (theme, size, edit toggle, row add/
// remove/reorder) — renderDashboard() then fills in live values.
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
        // Storage never scores an alert level (disk fullness isn't a
        // "something's wrong" signal here — see renderDashboard), so
        // there's nothing for this toggle to do on that card.
        if (def.id !== "storage") {
          items.push({
            type: "segmented",
            current: isCardAlertEnabled(def.id) ? "on" : "off",
            options: [
              { value: "on", label: "Alert flash", title: "Pulse the header when a reading gets bad" },
              { value: "off", label: "No flash", title: "Keep the header still no matter how bad a reading gets" },
            ],
            onSelect: (v) => setCardAlertEnabled(def.id, v === "on"),
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
      // Computed rows (currently just Chassis's FAN AVG) have no real
      // cfg.slots entry to guard on below, and — unlike every other
      // row — used to only get a value from the sparkline-feed loop
      // further down, which never runs at all once the card's display
      // is switched to "Rows" (no MultiSpark instance exists to feed).
      // Handling it here instead means it updates regardless of
      // Chart/Rows mode, same as everything else.
      if (row.computedFanAvg) {
        const avg = _chassisFanAvg(devices);
        const sv = document.getElementById("sv-" + row.sid);
        const sd = document.getElementById("sd-" + row.sid);
        if (sv) sv.textContent = fmt1(avg, "%");
        if (avg !== undefined) {
          if (sd) {
            sd.innerHTML = makeDots(
              dutyLevel(avg),
              getRowStyle(row) === "dots-meter" ? "meter" : "warn",
            );
          }
        }
        _trackPeak(row.sid, avg);
        _updatePeakTip(row.sid, "%");
        continue;
      }
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
          // Value/dots/peak already handled in the always-runs loop
          // above — this branch is spark-canvas-only, so it's a no-op
          // whenever the card has no chart (Rows mode) or this isn't a
          // tick frame.
          if (pushSparks) {
            const avg = _chassisFanAvg(devices);
            if (avg !== undefined) {
              spark.setFanNorm(100);
              spark.push("fan", avg);
            }
          }
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
    const alertOn = isCardAlertEnabled(def.id);
    hdr.classList.toggle("hdr-warm", alertOn && lvl === 4);
    hdr.classList.toggle("hdr-hot", alertOn && lvl >= 5);
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

