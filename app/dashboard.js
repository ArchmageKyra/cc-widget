/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — dashboard.js
   The core of the app: CARD_DEFS, buildCards(), card/row drag-reordering,
   renderDashboard(), and the MultiSpark sparkline renderer feeding each
   card's canvas.
   Depends on: themes.js, state.js, ui-widgets.js (load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// Structural change: rebuild every card, refill live values, refit the window.
function rebuildDashboard() {
  buildCards();
  renderDashboard(liveDevices);
  requestAnimationFrame(() => autoResize());
}
// Persist cfg, then rebuildDashboard().
function commitAndRebuild() {
  saveCfg();
  rebuildDashboard();
}


// ═══════════════════════════════════════════════════════════════
//  CARD DEFINITIONS
//  type "spark"  — canvas + rows. Row.sparkKey picks the series a row feeds;
//                  dynamicNorm auto-scales Y instead of a fixed 0–100;
//                  noPlot shows the value without plotting it.
//  type "sensor" — rows only, no canvas.
//  Rows with pctSid render as bar rows, the rest as "sr" rows. Every card
//  also accepts user-added rows (cfg.customRows) — see customRowsFor().
// ═══════════════════════════════════════════════════════════════
const CARD_DEFS = [
  {
    id: "cpu",
    lbl: "CPU",
    cls: "cpu",
    type: "spark",
    rows: [
      { sid: "cpu_temp", lbl: "TEMP", mode: "warn", sparkKey: "temp", typeFilter: ["temp"] },
      // Load comes from Linux /proc/stat, auto-assigned.
      { sid: "cpu_load", lbl: "LOAD", mode: "warn", sparkKey: "load", autoLinux: true, pctSid: "cpu_load" },
      { sid: "cpu_fan", lbl: "FAN", mode: "meter", sparkKey: "fan", typeFilter: ["rpm"] },
    ],
  },
  {
    id: "gpu",
    lbl: "GPU",
    cls: "gpu",
    type: "spark",
    rows: [
      { sid: "gpu_temp", lbl: "TEMP", mode: "warn", sparkKey: "temp", typeFilter: ["temp"] },
      { sid: "gpu_load", lbl: "LOAD", mode: "warn", sparkKey: "load", typeFilter: ["duty"], pctSid: "gpu_load" },
      { sid: "gpu_fan", lbl: "FAN", mode: "meter", sparkKey: "fan", typeFilter: ["rpm"] },
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
      { sid: "lnx_net_rx", lbl: "↓ RX", autoLinux: true, sparkKey: "temp", dynamicNorm: true },
      { sid: "lnx_net_tx", lbl: "↑ TX", autoLinux: true, sparkKey: "load", dynamicNorm: true },
    ],
  },
  {
    id: "case",
    lbl: "CHASSIS",
    cls: "fan",
    type: "spark",
    rows: [
      { sid: "case_temp", lbl: "AMB", mode: "warn", sparkKey: "temp", typeFilter: ["temp"] },
      // Computed, not a real sensor slot: mean duty% of the card's fan rows.
      { sid: "case_fan_avg", lbl: "FAN AVG", mode: "meter", sparkKey: "fan", unit: "%", computedFanAvg: true },
    ],
  },
  {
    // One bar row per mounted disk, generated from Linux disk data.
    id: "storage",
    lbl: "STORAGE",
    cls: "ssd",
    type: "sensor",
    autoDisks: true,
    rows: [],
  },
];


// ═══════════════════════════════════════════════════════════════
//  ROW BUILDERS
// ═══════════════════════════════════════════════════════════════
// Vertical accent bar beside a row; dashStyle: "solid" | "dashed" | "dotted".
function _accentBg(color, dashStyle) {
  if (dashStyle === "dashed")
    return `repeating-linear-gradient(to bottom,${color} 0px,${color} 4px,transparent 4px,transparent 8px)`;
  if (dashStyle === "dotted")
    return `repeating-linear-gradient(to bottom,${color} 0px,${color} 2px,transparent 2px,transparent 5px)`;
  return color;
}

// Dot readout HTML for a row at `lvl`, in the row's chosen dot style.
const _rowDots = (row, lvl) =>
  makeDots(lvl, getRowStyle(row) === "dots-meter" ? "meter" : "warn");

// data-sub feeds the hover tooltip; it's filled in by the render pass.
function _buildSrRow(row, accentColor, dashStyle = "solid") {
  const sd = SLOTS.find((s) => s.id === row.sid);
  // Custom rows aren't in SLOTS: take the unit from the assigned slot, or
  // from row.unit for computed rows.
  const unit = sd?.unit ?? cfg.slots[row.sid]?.unit ?? row.unit ?? "";
  const showDots = row.mode && getRowStyle(row) !== "num-only";
  const srow = el("div", "sr");
  srow.id = "sr-" + row.sid;
  srow.dataset.sid = row.sid;
  srow.dataset.sub = "--";
  // Order: [accent] [lbl flex:1] [val] [unit] [dots]
  srow.innerHTML = `
<span class="sr-accent" style="background:${_accentBg(accentColor, dashStyle)}"></span>
<span class="sr-lbl">${esc(row.lbl)}</span>
<span class="sr-val" id="sv-${row.sid}">--</span>
<span class="sr-unit">${unit}</span>
${showDots ? `<span id="sd-${row.sid}">${_rowDots(row, 0)}</span>` : ""}`;
  return srow;
}

function _buildBarRow(row, baseColor, dashStyle = "solid") {
  const srow = el("div", "sr");
  srow.id = "bar-" + row.sid;
  srow.dataset.sub = "--";
  srow.innerHTML = `
<span class="sr-accent" style="background:${_accentBg(baseColor, dashStyle)}"></span>
<span class="sr-lbl" id="bl-${row.sid}">${esc(row.lbl)}</span>
${row.usedSid || row.totalSid ? `<span class="br-sub" id="bv-${row.sid}" aria-hidden="true">--</span>` : ""}
<span class="br-pct-num" id="bp-${row.sid}">--</span><span class="br-pct-unit">%</span>
<div class="br-track"><div class="br-fill" id="bf-${row.sid}" style="width:0%;background:${baseColor}"></div></div>`;
  return srow;
}

// Bar or sr row, per the row's chosen style.
const _buildRow = (row, accent, dash) =>
  getRowStyle(row) === "bar"
    ? _buildBarRow(row, accent, dash)
    : _buildSrRow(row, accent, dash);

// Accent colour + line-dash style for a spark-card row. The dash doubles as
// the legend for that row's sparkline: fan dotted, load dashed, temp solid.
// noPlot rows get a neutral dim accent since nothing is plotted for them.
function _sparkAccent(row, cardColor, fanLine, loadColor) {
  if (row.noPlot) return { accent: withAlpha(cssVar("--txt-dim"), 0.45), dash: "solid" };
  if (row.sparkKey === "fan") return { accent: fanLine, dash: "dotted" };
  if (row.sparkKey === "load") return { accent: loadColor, dash: "dashed" };
  return { accent: cardColor, dash: "solid" };
}


// ═══════════════════════════════════════════════════════════════
//  PER-CARD PREFERENCES
// ═══════════════════════════════════════════════════════════════
// Flags live in cfg[key][cardId] = true; absent means false.
function _setCardFlag(key, cardId, flagged) {
  cfg[key] ??= {};
  if (flagged) cfg[key][cardId] = true;
  else delete cfg[key][cardId];
}

// Sparkline on/off. Off drops the canvas and the plotted/context split: every
// row renders flat, like Storage's.
const isSparkEnabled = (cardId) => !cfg.sparkOff?.[cardId];
function setSparkEnabled(cardId, on) {
  _setCardFlag("sparkOff", cardId, !on);
  commitAndRebuild();
}

// Sparkline peak markers. Per card because peaks mean little on some series
// (an ambient temp's "session high" is just the room).
const isPeakEnabled = (cardId) => !cfg.peakOff?.[cardId];
function setPeakEnabled(cardId, on) {
  _setCardFlag("peakOff", cardId, !on);
  saveCfg();
  // The spark instance already exists, so redraw without a full rebuild.
  const spark = sparks[cardId];
  if (spark) {
    spark.showPeaks = on;
    spark.draw();
  }
}

// Header alert pulse (hdr-warm/hdr-hot). Off keeps the plain accent bar but
// never flashes. Applies to every card with a warn-mode row.
const isCardAlertEnabled = (cardId) => !cfg.cardAlertOff?.[cardId];
function setCardAlertEnabled(cardId, on) {
  _setCardFlag("cardAlertOff", cardId, !on);
  saveCfg();
  // Alert classes are recomputed on every render, so just render now.
  renderDashboard(liveDevices);
}

// Manual hide. Hidden cards still render in edit mode, dimmed, with a "Hidden"
// badge that restores them. Needed because autoLinux rows show themselves as
// soon as Linux stats arrive and have no "clear assignment" escape hatch.
const isCardHidden = (cardId) => !!cfg.cardHidden?.[cardId];
function setCardHidden(cardId, hidden) {
  _setCardFlag("cardHidden", cardId, hidden);
  commitAndRebuild();
}

// Custom card title.
const cardLabel = (def) => cfg.cardLabels?.[def.id] || def.lbl;
function setCardLabel(cardId, label) {
  cfg.cardLabels ??= {};
  const def = CARD_DEFS.find((d) => d.id === cardId);
  const trimmed = (label || "").trim();
  if (trimmed && trimmed !== def?.lbl) cfg.cardLabels[cardId] = trimmed;
  else delete cfg.cardLabels[cardId];
  commitAndRebuild();
}

// CARD_DEFS in the user's saved drag order; cards missing from it go last.
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
//  MINI (COLLAPSED) CARDS
//  A mini card shrinks to its header: title, a few headline numbers, and a
//  severity bar per number. It's a viewing-density preference, so toggling is
//  a class flip — no rebuild — and the card's canvas/spark keep running
//  underneath, making expansion instant and gap-free. Forced off while
//  editing (see buildCards()), since a collapsed card hides every affordance
//  needed to reconfigure it.
// ═══════════════════════════════════════════════════════════════
const isCardMini = (cardId) => !!cfg.cardMini?.[cardId];

// Cards currently on screen and not hidden.
const _visibleCardIds = () =>
  orderedCardDefs()
    .map((d) => d.id)
    .filter((id) => document.getElementById("card-" + id) && !isCardHidden(id));

// Syncs a card's class and its header chevron with `mini`.
function _applyMiniState(cardId, mini) {
  document.getElementById("card-" + cardId)?.classList.toggle("mini", mini);
  const btn = document.getElementById("mini-tog-" + cardId);
  if (btn) {
    btn.innerHTML = mini ? _ICON_CHEVRON_DOWN : _ICON_CHEVRON_UP;
    btn.title = mini ? "Expand" : "Collapse";
  }
}

function setCardMini(cardId, mini) {
  _setCardFlag("cardMini", cardId, mini);
  saveCfg();
  _applyMiniState(cardId, mini);
  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}

// Collapse/expand every visible card in one pass (a single save).
function toggleAllCardsMini() {
  const ids = _visibleCardIds();
  if (!ids.length) return;
  const next = !ids.every(isCardMini);
  for (const id of ids) {
    _setCardFlag("cardMini", id, next);
    _applyMiniState(id, next);
  }
  saveCfg();
  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}

// Keeps the status bar's collapse/expand-all icon honest when cards were
// collapsed one by one.
function _updateMiniAllBtn() {
  const btn = document.getElementById("bb-mini-all");
  if (!btn) return;
  const ids = _visibleCardIds();
  const allMini = ids.length > 0 && ids.every(isCardMini);
  btn.innerHTML = allMini ? _ICON_CHEVRON_ALL_DOWN : _ICON_CHEVRON_ALL_UP;
  btn.title = allMini ? "Expand all" : "Collapse all";
}

// Every card's mini row has the same number of slots (missing ones render
// empty), so values line up in columns when several cards are collapsed.
const MINI_SLOTS = 3;

// Short labels for the headline numbers; other rows fall back to their
// stripped, truncated row label.
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
// Only short symbols fit a mini slot; wordier units (RPM, KB/s, W) are
// dropped, since the label already implies them.
function _miniUnitSuffix(unit) {
  if (unit === "°C") return "°";
  if (unit === "%") return "%";
  return "";
}

// Up to MINI_SLOTS headline {lbl, str, bar, full} values for a card's mini
// row. `full` is the un-abbreviated label, used as a hover tooltip. `bar` is
// a CSS colour: warn-mode metrics use the --w1…--w5 severity ramp; everything
// else gets the flat on/off --meter / --dot-off-meter read the full view's
// meter dots use, so every slot has a bar.
// Spark cards read their own rows; Storage, having no fixed rows, reports its
// busiest visible disk plus a disk count.
function _miniHeadline(def, devices) {
  const items = [];
  const meterBar = (v) =>
    typeof v === "number" && v > 0 ? "var(--meter)" : "var(--dot-off-meter)";
  const warnBar = (lvl) => (lvl > 0 ? `var(--w${lvl})` : "var(--dot-off-warn)");

  if (def.autoDisks) {
    const disks = diskChannels(getLatest(devices.find((d) => d.uid === "linux-system")));
    if (!disks.length) return items;
    const { ch, mount } = disks.reduce((a, b) =>
      (b.ch.duty ?? 0) > (a.ch.duty ?? 0) ? b : a,
    );
    items.push({
      lbl: pathLabel(mount).toUpperCase().slice(0, 5),
      str: Math.round(ch.duty ?? 0) + _miniUnitSuffix("%"),
      bar: meterBar(ch.duty),
      full: mount === "/" ? "Root — busiest disk" : `${mount} — busiest disk`,
    });
    if (disks.length > 1) {
      items.push({
        lbl: "DISKS",
        str: String(disks.length),
        bar: meterBar(disks.length),
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
    const unit = SLOTS.find((s) => s.id === row.sid)?.unit ?? row.unit ?? "";
    const bar =
      row.mode === "warn"
        ? warnBar(warnLevel(row.sid, v))
        : meterBar(getFanDuty(devices, slot) ?? v);
    items.push({
      lbl: _miniLbl(row),
      str: fmt1(v, unit) + _miniUnitSuffix(unit),
      bar,
      full: row.lbl,
    });
  }
  return items.slice(0, MINI_SLOTS);
}


// ═══════════════════════════════════════════════════════════════
//  DRAG REORDERING (edit mode only)
//  Manual pointer-based sort rather than native HTML5 DnD, so drag feedback
//  matches the rest of the app's chrome.
// ═══════════════════════════════════════════════════════════════
// The item in `list` that the pointer at `y` is just above, or null to append.
function _dragAfterElement(list, itemSelector, y) {
  let closest = { offset: -Infinity, element: null };
  for (const child of list.querySelectorAll(`${itemSelector}:not(.dragging)`)) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}

// Wires drag-sorting on #cards. Dragging a `gripSelector` element moves its
// enclosing `itemSelector` within `listFor(grip)`, then calls onDrop(list).
function _makeSortable({ gripSelector, itemSelector, listFor, onDrop }) {
  document.getElementById("cards").addEventListener("mousedown", (e) => {
    if (!editMode) return;
    const grip = e.target.closest(gripSelector);
    if (!grip) return;
    const item = grip.closest(itemSelector);
    const list = listFor(grip);
    if (!item || !list) return;
    e.preventDefault();
    item.classList.add("dragging");

    const onMove = (e2) => {
      const after = _dragAfterElement(list, itemSelector, e2.clientY);
      if (after == null) list.appendChild(item);
      else list.insertBefore(item, after);
    };
    const onUp = () => {
      item.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      onDrop(list);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// Cards, dragged by their header grip.
function initCardSort() {
  _makeSortable({
    gripSelector: ".card-grip",
    itemSelector: ".card",
    listFor: () => document.getElementById("cards"),
    onDrop: (list) => {
      cfg.cardOrder = [...list.querySelectorAll(":scope > .card")].map((c) =>
        c.id.replace(/^card-/, ""),
      );
      saveCfg();
    },
  });
}

// Custom rows, dragged by their row grip. The sort is scoped to the row's own
// .custom-rows-list so it never mixes with disk/named rows in that section.
function initRowSort() {
  _makeSortable({
    gripSelector: ".row-grip",
    itemSelector: ".sr",
    listFor: (grip) => grip.closest(".custom-rows-list"),
    onDrop: (list) => {
      cfg.rowOrder ??= {};
      cfg.rowOrder[list.dataset.cardId] = [...list.querySelectorAll(":scope > .sr")].map(
        (r) => r.dataset.sid,
      );
      commitAndRebuild();
    },
  });
}


// ═══════════════════════════════════════════════════════════════
//  BUILD CARDS
// ═══════════════════════════════════════════════════════════════
// A card shows once it has something to display: an assigned slot, Linux
// data for an autoLinux/disk card, custom rows, or (in edit mode) slots
// waiting to be assigned.
function _cardHasContent(def, linuxLat) {
  const hasAssigned = def.rows?.some((r) => !r.autoLinux && cfg.slots[r.sid]);
  const hasAutoLinux = def.rows?.some((r) => r.autoLinux) && !!linuxLat;
  const hasDiskRows =
    def.autoDisks && diskChannels(linuxLat, { includeHidden: true }).length > 0;
  const hasCustomRows = (cfg.customRows?.[def.id]?.length ?? 0) > 0;
  const hasEditRows =
    editMode &&
    (def.rows?.some((r) => !r.autoLinux && r.typeFilter) || def.autoDisks);
  return !!(hasAssigned || hasAutoLinux || hasDiskRows || hasCustomRows || hasEditRows);
}

// "⋯" menu for a card header: colour, chart/peaks/alert toggles, rename, hide.
function _cardMenuItems(def) {
  const varName = "--" + def.cls;
  const items = [
    {
      type: "color",
      label: cardLabel(def) + " color",
      value: cssVar(varName) || "#888888",
      onChange: (hex) => {
        if (_tbSetVar) _tbSetVar(varName, hex);
      },
    },
  ];
  const toggle = (isOn, setOn, onOpt, offOpt) => ({
    type: "segmented",
    current: isOn(def.id) ? "on" : "off",
    options: [
      { value: "on", ...onOpt },
      { value: "off", ...offOpt },
    ],
    onSelect: (v) => setOn(def.id, v === "on"),
  });

  if (def.type === "spark") {
    items.push(
      toggle(
        isSparkEnabled,
        setSparkEnabled,
        { label: "Chart", title: "Show plotted sparkline" },
        { label: "Rows", title: "Show as plain sensor rows, no chart" },
      ),
      toggle(
        isPeakEnabled,
        setPeakEnabled,
        { label: "Peaks", title: "Mark each series' session-high on the chart" },
        { label: "No peaks", title: "Hide the peak markers on this card" },
      ),
    );
  }
  // Storage never scores an alert level (disk fullness isn't a "something's
  // wrong" signal; see renderDashboard), so the toggle would do nothing.
  if (def.id !== "storage") {
    items.push(
      toggle(
        isCardAlertEnabled,
        setCardAlertEnabled,
        { label: "Alert flash", title: "Pulse the header when a reading gets bad" },
        { label: "No flash", title: "Keep the header still no matter how bad a reading gets" },
      ),
    );
  }
  items.push({
    label: "Rename",
    onClick: () => {
      const nl = prompt("Card name:", cardLabel(def));
      if (nl !== null) setCardLabel(def.id, nl);
    },
  });
  // Unhiding is the "Hidden" badge's job, and this menu doesn't render while
  // a card is hidden.
  items.push({
    label: "Hide card",
    danger: true,
    onClick: () => setCardHidden(def.id, true),
  });
  return items;
}

// Card header markup and its click handlers.
function _buildCardHeader(card, def, { hidden, mini }) {
  // A hidden card's only affordance is its badge (no "⋯" menu).
  card.innerHTML = `<div class="card-hdr ${def.cls}" id="hdr-${def.id}">${
    editMode
      ? `<button class="card-grip" title="Drag to reorder" type="button">${_ICON_GRIP}</button>`
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

  if (!editMode && !hidden) {
    const toggleMini = () => setCardMini(def.id, !isCardMini(def.id));
    card.querySelector(".card-mini-toggle").onclick = (e) => {
      e.stopPropagation();
      toggleMini();
    };
    // The whole header toggles, not just the small chevron.
    const hdrEl = card.querySelector(".card-hdr");
    hdrEl.classList.add("card-hdr-toggleable");
    hdrEl.onclick = toggleMini;
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
      _openRowMenu(moreBtn, _cardMenuItems(def));
    };
  }
}

// Storage rows: one bar per visible mount, plus (in edit mode) a hide button
// on each and a "show" row for every hidden mount.
function _buildDiskRows(body, cardColor, linuxLat) {
  for (const { mount } of diskChannels(linuxLat)) {
    // used/total only need to be truthy here to get the "used/total" sub-span;
    // renderDashboard() fills in the values right after.
    const srow = _buildBarRow(
      { sid: diskSid(mount), lbl: pathLabel(mount), usedSid: true, totalSid: true },
      cardColor,
    );
    if (editMode) {
      const hideBtn = el("button", "slot-clr");
      hideBtn.title = `Hide ${mount}`;
      hideBtn.textContent = "×";
      hideBtn.onclick = (e) => {
        e.stopPropagation();
        cfg.hiddenMounts ??= [];
        if (!cfg.hiddenMounts.includes(mount)) cfg.hiddenMounts.push(mount);
        commitAndRebuild();
      };
      srow.appendChild(hideBtn);
    }
    body.appendChild(srow);
  }

  if (editMode) {
    for (const mount of cfg.hiddenMounts ?? []) {
      const rrow = el("div", "sr hidden-mount");
      rrow.innerHTML = `<span class="sr-accent" style="background:${cardColor};opacity:.3"></span>
<span class="sr-lbl">${esc(pathLabel(mount))}</span>`;
      const restBtn = el("button", "assign-badge");
      restBtn.textContent = "show";
      restBtn.onclick = (e) => {
        e.stopPropagation();
        cfg.hiddenMounts = cfg.hiddenMounts.filter((m) => m !== mount);
        commitAndRebuild();
      };
      rrow.appendChild(restBtn);
      body.appendChild(rrow);
    }
  }
}

function _buildSensorCardBody(card, def, cardColor, linuxLat) {
  const body = el("div", "card-rows-full");
  card.appendChild(body);

  if (def.autoDisks && linuxLat) _buildDiskRows(body, cardColor, linuxLat);

  // Named rows: no "sensor" card uses them today (Storage is disks only),
  // but the path stays generic. Only custom rows are drag-reorderable.
  for (const row of def.rows || []) {
    if (!row.autoLinux && !cfg.slots[row.sid] && !editMode) continue;
    const elem = _buildRow(row, cardColor);
    if (editMode) _hardRowMenu(elem, row);
    body.appendChild(elem);
  }
  _renderCustomRowSection(def, body);
}

function _buildSparkCardBody(card, def, colors, linuxHasData) {
  const { cardColor, loadColor, fanLine } = colors;
  const sparkOn = isSparkEnabled(def.id);
  // rcol holds the plotted rows; ctxBody the "context" rows (noPlot + custom)
  // shown below the chart so plotted and context rows stay visually distinct.
  let rcol, ctxBody;

  if (sparkOn) {
    const body = el("div", "card-spark");
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
    ctxBody = el("div", "card-spark-ctx");
  } else {
    // No canvas, no plotted/context split: every row renders flat.
    const body = el("div", "card-rows-full");
    card.appendChild(body);
    rcol = ctxBody = body;
  }

  const accentFor = (row) =>
    sparkOn
      ? _sparkAccent(row, cardColor, fanLine, loadColor)
      : { accent: cardColor, dash: "solid" };

  for (const row of def.rows) {
    if (row.computedFanAvg) {
      if (!_chassisFanRows().length && !editMode) continue;
      const { accent, dash } = accentFor(row);
      rcol.appendChild(_buildSrRow(row, accent, dash));
      continue;
    }
    if (row.autoLinux) {
      if (!cfg.slots[row.sid] && !linuxHasData) continue;
      const { accent, dash } = accentFor(row);
      const elem = _buildRow(row, accent, dash);
      if (editMode) _hardRowMenu(elem, row, { isAutoLinux: true });
      rcol.appendChild(elem);
      continue;
    }
    // CC-sourced rows: shown once assigned, or while editing.
    if (!cfg.slots[row.sid] && !editMode) continue;
    const { accent, dash } = accentFor(row);
    const elem = _buildRow(row, accent, dash);
    if (editMode) _hardRowMenu(elem, row);
    (sparkOn && row.noPlot ? ctxBody : rcol).appendChild(elem);
  }

  _renderCustomRowSection(def, ctxBody);

  // In flat mode ctxBody is already attached.
  if (sparkOn && ctxBody.childElementCount > 0) card.appendChild(ctxBody);
}

// Tears down and recreates every card's DOM from CARD_DEFS + cfg (slots,
// custom rows, mini/hidden/order state). Called on any structural change;
// renderDashboard() then fills in live values.
function buildCards() {
  const c = document.getElementById("cards");
  c.innerHTML = "";
  sparks = {};
  c.classList.toggle("editing", editMode);

  const linuxLat = getLatest(liveDevices.find((d) => d.uid === "linux-system"));

  for (const def of orderedCardDefs()) {
    // A hidden card still renders in edit mode, dimmed, so it can be restored.
    if (isCardHidden(def.id) && !editMode) continue;
    if (!_cardHasContent(def, linuxLat)) continue;

    const card = el("div", "card");
    card.id = "card-" + def.id;
    const hidden = isCardHidden(def.id);
    const mini = isCardMini(def.id) && !editMode;
    if (hidden) card.classList.add("card-hidden-preview");
    card.classList.toggle("mini", mini);
    _buildCardHeader(card, def, { hidden, mini });
    c.appendChild(card);

    const cardColor = cssVar("--" + def.cls);
    if (def.type === "spark") {
      _buildSparkCardBody(
        card,
        def,
        {
          cardColor,
          loadColor: withAlpha(cardColor, 0.55),
          fanLine: def.cls === "fan" ? cardColor : cssVar("--fan"),
        },
        !!linuxLat,
      );
    } else if (def.type === "sensor") {
      _buildSensorCardBody(card, def, cardColor, linuxLat);
    }
  }

  _updateMiniAllBtn();
  requestAnimationFrame(() => autoResize());
}


// ═══════════════════════════════════════════════════════════════
//  RENDER DASHBOARD
// ═══════════════════════════════════════════════════════════════
// Unit for a custom row, derived from its slot (custom rows aren't in SLOTS).
const _slotUnit = (slot) =>
  slot.unit ??
  (slot.field === "duty"
    ? "%"
    : slot.field === "rpm"
      ? "RPM"
      : slot.kind === "temp"
        ? "°C"
        : "");

// Writes a row's value and dot ramp, then records its peak. Returns the
// reading and its level (undefined while there's no reading).
function _paintRow(devices, row, slot, unit) {
  const v = getSlotValue(devices, slot);
  const sv = document.getElementById("sv-" + row.sid);
  const sd = document.getElementById("sd-" + row.sid);
  if (sv) sv.textContent = fmt1(v, unit);
  let lvl;
  if (v !== undefined) {
    lvl =
      row.mode === "warn"
        ? warnLevel(row.sid, v)
        : fanDotLevel(v, getFanDuty(devices, slot), row.sid);
    if (sd) sd.innerHTML = _rowDots(row, lvl);
  }
  _trackPeak(row.sid, v);
  return { v, lvl };
}

// Fills a bar row's fill, percentage, used/total text and hover tip.
function _paintBar(sid, baseColor, pctRaw, used, total) {
  const pct = clampPct(pctRaw);
  const bf = document.getElementById("bf-" + sid);
  if (bf) {
    bf.style.width = `${pct}%`;
    bf.style.background = barColorForPct(pct, baseColor);
  }
  const bp = document.getElementById("bp-" + sid);
  if (bp) bp.textContent = pctRaw !== undefined ? `${Math.round(pct)}` : "--";
  const bv = document.getElementById("bv-" + sid);
  if (bv) bv.textContent = barText(used, total);
  _updatePeakTip(sid, "%", barText(used, total));
}

// Chassis FAN AVG: computed, so it has no slot for the named-row path. It's
// painted independently of the chart so it updates in Rows mode too.
function _paintFanAvgRow(devices, row) {
  const avg = _chassisFanAvg(devices);
  const sv = document.getElementById("sv-" + row.sid);
  const sd = document.getElementById("sd-" + row.sid);
  if (sv) sv.textContent = fmt1(avg, "%");
  if (avg !== undefined && sd) sd.innerHTML = _rowDots(row, dutyLevel(avg));
  _trackPeak(row.sid, avg);
  _updatePeakTip(row.sid, "%");
}

function _paintNamedRow(devices, def, row, bumpAlert) {
  const slot = cfg.slots[row.sid];
  const unit = SLOTS.find((s) => s.id === row.sid)?.unit ?? "";
  const { v, lvl } = _paintRow(devices, row, slot, unit);
  if (lvl !== undefined && row.mode === "warn") bumpAlert(def.id, lvl);

  if ((def.type === "sensor" || def.type === "spark") && row.pctSid) {
    const used = row.usedSid ? getSlotValue(devices, cfg.slots[row.usedSid]) : undefined;
    const total = row.totalSid ? getSlotValue(devices, cfg.slots[row.totalSid]) : undefined;
    const rowVisible =
      v !== undefined || (typeof used === "number" && typeof total === "number");
    document.getElementById("bar-" + row.sid)?.classList.toggle("bar-hide", !rowVisible);
    _paintBar(row.sid, cssVar("--" + def.cls), v, used, total);
  } else {
    _updatePeakTip(row.sid, unit);
  }
}

// Storage bars. Returns false if a mount has no DOM row yet, in which case
// the cards were rebuilt and this render pass should stop.
function _paintDiskRows(devices) {
  const lat = getLatest(devices.find((d) => d.uid === "linux-system"));
  if (!lat) return true;
  for (const { ch, mount } of diskChannels(lat)) {
    const sid = diskSid(mount);
    if (!document.getElementById("bar-" + sid)) {
      buildCards();
      return false;
    }
    const used = lat.channels.find((c) => c.name === `Disk ${mount} Used`)?.watts;
    const total = lat.channels.find((c) => c.name === `Disk ${mount} Total`)?.watts;
    const pctRaw = typeof ch.duty === "number" ? ch.duty : undefined;
    _trackPeak(sid, pctRaw);
    _paintBar(sid, cssVar("--ssd"), pctRaw, used, total);
  }
  return true;
}

// Appends this tick's points to a spark card's series.
function _feedSpark(devices, def, spark) {
  spark.tick();
  for (const row of def.rows) {
    if (row.computedFanAvg) {
      const avg = _chassisFanAvg(devices);
      if (avg !== undefined) {
        spark.setNorm("fan", 100);
        spark.push("fan", avg);
      }
      continue;
    }
    const slot = cfg.slots[row.sid];
    if (!slot || !row.sparkKey || row.noPlot) continue;
    const v = getSlotValue(devices, slot);
    if (row.sparkKey === "fan") {
      const duty = getFanDuty(devices, slot);
      if (duty !== undefined) {
        spark.setNorm("fan", 100);
        spark.push("fan", duty);
      } else if (v !== undefined) {
        spark.trackMax("fan", v);
        spark.push("fan", v);
      }
    } else {
      spark.push(row.sparkKey, v, sessionPeaks[row.sid]);
    }
  }
}

// Header alert bar and mini-row values. Only the top two severity bands touch
// a card's accent bar (levels 1–3 are routine fluctuation), and Storage never
// does. Mini values stay current while collapsed, so expanding is a class flip.
function _paintHeaders(devices, cardAlert) {
  for (const def of CARD_DEFS) {
    const hdr = document.getElementById("hdr-" + def.id);
    if (!hdr) continue;

    const miniVals = document.getElementById("mini-" + def.id);
    if (miniVals) {
      const heads = _miniHeadline(def, devices);
      miniVals.innerHTML = Array.from({ length: MINI_SLOTS }, (_, i) => heads[i] ?? null)
        .map((it) =>
          it
            ? `<span class="mini-val" title="${esc(it.full)}"><span class="mini-bar" style="background:${it.bar}"></span><span class="mini-val-lbl">${esc(it.lbl)}</span><span class="mini-val-num">${esc(it.str)}</span></span>`
            : `<span class="mini-val mini-val-empty"></span>`,
        )
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

// Fills the cards with live values. Text, dots and bars update on every call
// (SSE packet, Linux stats push, …); sparkline points are added only when
// pushSparks is set, by the fixed 1 Hz ticker below.
function renderDashboard(devices, { pushSparks = false } = {}) {
  // Per-card worst warn-level this pass, for the header alert. Only "warn"
  // rows count (meter rows show intensity, not a problem), and Storage is
  // left out entirely.
  const cardAlert = {};
  const bumpAlert = (cardId, lvl) => {
    if (typeof lvl !== "number") return;
    cardAlert[cardId] = Math.max(cardAlert[cardId] ?? 0, lvl);
  };

  for (const def of CARD_DEFS) {
    for (const row of def.rows || []) {
      if (row.computedFanAvg) _paintFanAvgRow(devices, row);
      else if (cfg.slots[row.sid]) _paintNamedRow(devices, def, row, bumpAlert);
    }

    if (def.autoDisks && !_paintDiskRows(devices)) return;

    const spark = sparks[def.id];
    if (pushSparks && spark && def.type === "spark") _feedSpark(devices, def, spark);
  }

  // Custom rows live in cfg.customRows, not def.rows.
  for (const [cardId, rows] of Object.entries(cfg.customRows ?? {})) {
    for (const row of rows) {
      const slot = cfg.slots[row.sid];
      if (!slot) continue;
      const unit = _slotUnit(slot);
      const { lvl } = _paintRow(devices, row, slot, unit);
      if (lvl !== undefined && row.mode === "warn") bumpAlert(cardId, lvl);
      _updatePeakTip(row.sid, unit);
    }
  }

  _paintHeaders(devices, cardAlert);
}

// Sparklines are fed from their own steady 1 s clock. Sampling on render
// events (SSE packets and the 2 s Linux push, irregularly interleaved) made
// each plotted step span a different slice of real time and the trace kink;
// on this clock every step is exactly one second (see MultiSpark's MAX/BAR).
setInterval(() => {
  if (phase === "dashboard") renderDashboard(liveDevices, { pushSparks: true });
}, 1000);


// ═══════════════════════════════════════════════════════════════
//  MULTI-SERIES SPARKLINE
//  Up to three series drawn fan → load → temp so temp sits on top: temp
//  solid with fill, load dashed, fan dotted. Gridlines at 25/50/75/100%.
//  The line styles double as the legend (see _sparkAccent), so there's no
//  separate HTML key.
// ═══════════════════════════════════════════════════════════════
class MultiSpark {
  constructor(canvas, { cardColor, loadColor, fanLine, W, H, dpr = 1, showPeaks = true } = {}) {
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
    this.W = W;
    this.H = H;
    this.showPeaks = showPeaks;
    this.MAX = 61; // points kept: 60 one-second intervals = a clean 1-minute window
    this.BAR = 10; // vertical marker every 10 s (60/10 leaves no remainder at the edge)

    const series = (color, dash, lw, fill) => ({
      data: [],
      norm: 100,
      dynamic: false,
      color,
      dash,
      lw,
      fill,
      peak: undefined,
    });
    this.S = {
      temp: series(cardColor, [], 1.6, true),
      load: series(loadColor, [5, 3], 1.2, false),
      fan: series(fanLine, [2, 4], 1.0, false),
    };

    // Peak markers are DOM elements rather than canvas drawings, parented to
    // .spark-col (position: relative) so they can spill past the canvas edge.
    this.peakDots = {};
    const container = canvas.parentElement;
    for (const key of Object.keys(this.S)) {
      const dot = document.createElement("div");
      dot.className = "spark-peak-dot";
      dot.style.display = "none";
      container.appendChild(dot);
      this.peakDots[key] = dot;
    }

    // Wall-clock times parallel to the data, since push cadence isn't
    // perfectly regular and the time-horizon label should be honest.
    this.times = [];
  }

  // Call once per render tick (not per push) so the label reflects real
  // elapsed time even when a card's series don't all push on the same tick.
  tick() {
    this.times.push(Date.now());
    if (this.times.length > this.MAX) this.times.shift();
  }

  // Auto-scale a series from its visible window (×1.2 headroom) instead of
  // a fixed 100. For metrics with no natural ceiling, e.g. network KB/s.
  setDynamic(key, dynamic = true) {
    const s = this.S[key];
    if (s) s.dynamic = dynamic;
  }
  setNorm(key, n) {
    const s = this.S[key];
    if (s) s.norm = n;
  }
  // Put several dynamic series on one Y-scale (RX/TX) so their heights stay
  // comparable.
  setSharedNorm(keys) {
    if (!Array.isArray(keys) || keys.length < 2) return;
    const values = [];
    for (const key of keys) {
      const s = this.S[key];
      if (s) values.push(...s.data);
    }
    const norm = Math.max(0.05, ...values) * 1.2;
    for (const key of keys) {
      const s = this.S[key];
      if (s) s.norm = norm;
    }
  }
  // Recomputed from the visible window each time (not a one-way ratchet), so
  // the scale relaxes once a spike scrolls out of view.
  trackMax(key, val) {
    const s = this.S[key];
    if (!s || typeof val !== "number" || isNaN(val)) return;
    const recentMax = Math.max(val, ...s.data);
    s.norm = Math.max(0.05, recentMax * 1.2);
  }

  push(key, val, peakOverride) {
    if (val == null || isNaN(val)) return;
    const s = this.S[key];
    if (!s) return;
    s.data.push(val);
    if (s.data.length > this.MAX) s.data.shift();
    if (s.dynamic) {
      this.trackMax(key, val);
      // RX and TX (temp/load series) share one scale.
      if (key !== "fan") this.setSharedNorm(["temp", "load"]);
      // Windowed max, not all-time, so the marker always lands inside the
      // drawn scale; the all-time high still shows in the row's hover tip.
      s.peak = Math.max(val, ...s.data);
    } else if (typeof peakOverride === "number") {
      // The caller's peak (sessionPeaks) survives card rebuilds, so it beats
      // this instance's short-lived tracking.
      s.peak = peakOverride;
    } else if (s.peak === undefined || val > s.peak) {
      s.peak = val;
    }
    this.draw();
  }

  draw() {
    const { ctx, W, H, S, MAX, BAR } = this;

    ctx.clearRect(0, 0, W, H);

    const xOf = (i, len) => (i + MAX - len) * (W / (MAX - 1));
    const yOf = (v, norm) => {
      const p = Math.min(1, Math.max(0, v / (norm || 1)));
      return H - p * H * 0.86 - H * 0.04;
    };

    // Horizontal gridlines. Alpha is fixed here, not themed: some themes'
    // --spark-grid is too faint to read. The midline is brighter.
    ctx.save();
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    const gridColor = cssVar("--spark-grid") || "rgba(255,255,255,0.06)";
    for (const pct of [0.25, 0.5, 0.75, 1.0]) {
      const y = yOf(pct, 1);
      ctx.strokeStyle = withAlpha(gridColor, pct === 0.5 ? 0.22 : 0.13);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Vertical time markers
    const maxLen = Math.max(...Object.values(S).map((s) => s.data.length), 2);
    ctx.strokeStyle = withAlpha(
      cssVar("--spark-vtick") || "rgba(255,255,255,0.04)",
      0.09,
    );
    for (let i = maxLen - 1; i >= 0; i -= BAR) {
      const x = xOf(i, maxLen);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.restore();

    // Series, fan → load → temp
    for (const key of ["fan", "load", "temp"]) {
      const s = S[key];
      if (s.data.length < 2) continue;

      if (s.fill) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, withAlpha(s.color, 0.22));
        g.addColorStop(1, withAlpha(s.color, 0.0));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xOf(0, s.data.length), H);
        s.data.forEach((v, i) =>
          ctx.lineTo(xOf(i, s.data.length), yOf(v, s.norm)),
        );
        ctx.lineTo(xOf(s.data.length - 1, s.data.length), H);
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

    // Time-horizon label, drawn on a scrim so it stays legible over
    // whatever is plotted near the floor.
    const span = _fmtSpan(
      this.times.length >= 2
        ? this.times[this.times.length - 1] - this.times[0]
        : undefined,
    );
    if (span) {
      const fontSize = Math.max(7, Math.round(H * 0.088));
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
      ctx.fillRect(0, H - boxH, boxW, boxH);
      ctx.fillStyle = withAlpha(cssVar("--txt-dim") || "#888", 0.85);
      ctx.textBaseline = "bottom";
      ctx.fillText(label, padX, H - padY);
      ctx.restore();
    }
  }
}
