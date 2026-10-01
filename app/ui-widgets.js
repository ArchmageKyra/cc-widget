/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — ui-widgets.js
   Per-row interactive widgetry shared across cards: display-style cycling,
   the "⋯" row menu, hover sub-tooltips, user-added custom rows, and the
   sensor picker overlay used to assign or reassign any row.
   Depends on: themes.js, state.js (load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  ROW STYLE — user-selectable display per row
//    "bar"        fill bar + percentage (rows with pctSid only)
//    "dots-warn"  colour dot ramp, green → red
//    "dots-meter" muted dot ramp, neutral intensity
//    "num-only"   value only
// ═══════════════════════════════════════════════════════════════
function getRowStyle(row) {
  const saved = cfg.rowStyles?.[row.sid];
  if (saved && !(saved === "bar" && !row.pctSid)) return saved;
  if (row.pctSid) return "bar";
  if (row.mode === "meter") return "dots-meter";
  if (row.mode) return "dots-warn";
  return "num-only";
}

// Styles a row can switch between, in display order.
function _rowStyleOptions(row) {
  if (row.pctSid) return ["bar", "dots-warn", "dots-meter", "num-only"];
  if (row.mode) return ["dots-warn", "dots-meter", "num-only"];
  return [];
}

function setRowStyle(row, style) {
  cfg.rowStyles ??= {};
  cfg.rowStyles[row.sid] = style;
  commitAndRebuild();
}

const _STYLE_INFO = {
  bar: { label: "▬", title: "Bar" },
  "dots-warn": { label: "●●", title: "Warning dots" },
  "dots-meter": { label: "○○", title: "Meter dots" },
  "num-only": { label: "#", title: "Number only" },
};

// "⋯" menu entry for switching a row's display style (null if there's no choice).
function _styleSegItem(row) {
  const options = _rowStyleOptions(row);
  if (!options.length) return null;
  return {
    type: "segmented",
    current: getRowStyle(row),
    options: options.map((v) => ({
      value: v,
      label: _STYLE_INFO[v].label,
      title: _STYLE_INFO[v].title,
    })),
    onSelect: (v) => setRowStyle(row, v),
  };
}


// ═══════════════════════════════════════════════════════════════
//  "⋯" MENU
//  items: [{ label, danger?, onClick }]
//       | [{ type: "segmented", options: [{value,label,title}], current, onSelect }]
//       | [{ type: "color", label?, value, onChange }]
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

function _segmentedMenuEntry(it) {
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
  return seg;
}

// Colour swatch (native picker) plus a typeable hex field.
function _colorMenuEntry(it) {
  const wrap = el("div", "row-menu-color");
  if (it.label) {
    const lbl = el("span", "row-menu-color-lbl");
    lbl.textContent = it.label;
    wrap.appendChild(lbl);
  }
  const row = el("div", "row-menu-color-row");
  // Wrapper div + invisible input, same technique as .tb-swatch, so the chip
  // renders as a clean filled square instead of a native colour-input frame.
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

  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

  chip.addEventListener("input", (e) => {
    hexInp.classList.remove("invalid");
    hexInp.value = e.target.value;
    chipWrap.style.background = e.target.value;
    it.onChange(e.target.value);
  });
  hexInp.addEventListener("input", () => {
    let v = hexInp.value.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    if (isHex(v)) {
      hexInp.classList.remove("invalid");
      hexInp.value = v;
      chip.value = v;
      chipWrap.style.background = v;
      it.onChange(v);
    } else {
      hexInp.classList.add("invalid");
    }
  });
  hexInp.addEventListener("blur", () => {
    if (!isHex(hexInp.value.trim())) {
      hexInp.classList.remove("invalid");
      hexInp.value = chip.value; // revert to the last valid colour
    }
  });
  hexInp.addEventListener("keydown", (e) => e.stopPropagation());

  row.appendChild(chipWrap);
  row.appendChild(hexInp);
  wrap.appendChild(row);
  return wrap;
}

function _openRowMenu(anchorBtn, items) {
  _closeRowMenu();
  const menu = el("div", "row-menu");
  for (const it of items) {
    if (it.type === "segmented") {
      menu.appendChild(_segmentedMenuEntry(it));
    } else if (it.type === "color") {
      menu.appendChild(_colorMenuEntry(it));
    } else {
      const b = el("button", "row-menu-item" + (it.danger ? " danger" : ""));
      b.textContent = it.label;
      b.onclick = (e) => {
        e.stopPropagation();
        _closeRowMenu();
        it.onClick();
      };
      menu.appendChild(b);
    }
  }
  document.body.appendChild(menu);

  const r = anchorBtn.getBoundingClientRect();
  const left = Math.max(4, r.right - menu.offsetWidth);
  let top = r.bottom + 4;
  if (top + menu.offsetHeight > window.innerHeight - 4) {
    top = r.top - menu.offsetHeight - 4; // flip above if it would overflow
  }
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  _rowMenuEl = menu;
  // Deferred so the click that opened the menu doesn't immediately close it.
  setTimeout(
    () => document.addEventListener("click", _rowMenuOutsideClick, true),
    0,
  );
}

// The "⋯" button that opens a row's menu; `buildItems()` returns the entries.
function _makeMoreButton(buildItems) {
  const more = el("button", "assign-badge row-more");
  more.textContent = "⋯";
  more.title = "Row options";
  more.onclick = (e) => {
    e.stopPropagation();
    const items = buildItems();
    if (items.length) _openRowMenu(more, items);
  };
  return more;
}

// Menu for built-in (non-custom) rows: display style plus sensor assign/remap.
// isAutoLinux rows offer "Remap source" (any device, Linux included);
// others offer "Assign / Change sensor" limited to the row's typeFilter.
function _hardRowMenu(elem, row, { isAutoLinux = false } = {}) {
  if (!editMode) return;
  elem.classList.add("assignable");
  elem.appendChild(
    _makeMoreButton(() => {
      const items = [];
      const seg = _styleSegItem(row);
      if (seg) items.push(seg);
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
              commitAndRebuild();
            },
          });
        }
      }
      return items;
    }),
  );
}


// ═══════════════════════════════════════════════════════════════
//  SUB TOOLTIP — hover tip above a row ("used / total · peak")
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

// Delegated on #app so the listeners survive buildCards() rebuilds.
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
  if (e.target.closest(".sr[data-sub]")) _hideSubTip();
});


// ═══════════════════════════════════════════════════════════════
//  CUSTOM ROWS — user-added rows on a card. Display-only (noPlot), never
//  feeding the sparkline. They reuse the built-in rows' slot/typeFilter/style
//  machinery, with a generated sid and their own saved order.
// ═══════════════════════════════════════════════════════════════
const ALL_SENSOR_TYPES = ["temp", "rpm", "duty", "watts"];

function _findCustomRow(sid) {
  for (const rows of Object.values(cfg.customRows ?? {})) {
    const r = rows.find((x) => x.sid === sid);
    if (r) return r;
  }
  return null;
}

// Custom sids aren't in SLOTS, so the picker title needs this lookup.
const _customRowLabel = (sid) => _findCustomRow(sid)?.lbl ?? null;

const _newCustomSid = (cardId) =>
  `custom_${cardId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Fan/duty channels get "meter" mode (dutyLevel off the live duty%); "warn"
// mode only works for sensors with a WARN_T table. A generated custom sid is
// never a WARN_T key, so warnLevel() would freeze a fan row at a constant 2.
const _isFanLike = (leaf) =>
  leaf.kind === "channel" && (leaf.field === "rpm" || leaf.field === "duty");

function _registerCustomRow(cardId, row, slot) {
  cfg.customRows ??= {};
  (cfg.customRows[cardId] ??= []).push(row);
  cfg.rowOrder ??= {};
  (cfg.rowOrder[cardId] ??= []).push(row.sid);
  cfg.slots[row.sid] = slot;
}

// A card's custom rows in their saved order; rows missing from the saved
// order (newly added) go last.
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
  out.push(...bySid.values());
  return out;
}

function addCustomRow(cardId, leaf) {
  const sid = _newCustomSid(cardId);
  const row = {
    sid,
    lbl: shortLabel(leaf.label) || leaf.name,
    mode: _isFanLike(leaf) ? "meter" : "warn",
    noPlot: true,
    custom: true,
    typeFilter: ALL_SENSOR_TYPES,
  };
  _registerCustomRow(cardId, row, { ...leaf });
  return sid;
}

function moveCustomRow(cardId, sid, dir) {
  const order = customRowsFor(cardId).map((r) => r.sid);
  const i = order.indexOf(sid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  cfg.rowOrder ??= {};
  cfg.rowOrder[cardId] = order;
  commitAndRebuild();
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
  rebuildDashboard();
}

// "⋯" menu entries for one custom row.
function _customRowMenuItems(def, row, idx, count) {
  const items = [];
  // Style picker first, matching the built-in row menu (_hardRowMenu).
  const seg = _styleSegItem(row);
  if (seg) items.push(seg);
  items.push({
    label: "Rename",
    onClick: async () => {
      const nl = await showTextPrompt({
        title: "Rename Row",
        label: "Label",
        defaultValue: row.lbl,
      });
      if (nl && nl.trim()) {
        row.lbl = nl.trim();
        commitAndRebuild();
      }
    },
  });
  if (row.kind === "folder") {
    items.push({
      label: "Change path…",
      onClick: () => {
        pickFolder((newPath) => {
          if (newPath === row.path) return;
          row.path = newPath;
          cfg.slots[row.sid] = {
            ...cfg.slots[row.sid],
            name: `Folder ${newPath}`,
            label: `Folder: ${newPath}`,
          };
          saveCfg();
          _sendFolderPaths();
          rebuildDashboard();
        });
      },
    });
  } else {
    items.push({
      label: "Change sensor…",
      onClick: () => openPicker(row.sid, ALL_SENSOR_TYPES, true),
    });
  }
  // Dragging the row's grip is the primary way to reorder; these are the keyboard-free fallback.
  if (idx > 0)
    items.push({
      label: "Move up",
      onClick: () => moveCustomRow(def.id, row.sid, -1),
    });
  if (idx < count - 1)
    items.push({
      label: "Move down",
      onClick: () => moveCustomRow(def.id, row.sid, 1),
    });
  items.push({
    label: "Remove row",
    danger: true,
    onClick: () => removeCustomRow(def.id, row.sid),
  });
  return items;
}

// Renders a card's custom rows (saved order) plus the trailing "+ Add row"
// affordance. Rows sit in their own .custom-rows-list so drag-reordering
// (initRowSort()) never mixes them with disk/named rows in the same section.
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
      grip.innerHTML = _ICON_GRIP;
      elem.insertBefore(grip, elem.firstChild);
      elem.appendChild(
        _makeMoreButton(() => _customRowMenuItems(def, row, idx, rows.length)),
      );
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
//  PICKER OVERLAY
//  openPicker(slotId, typeFilter, includeLinux, newRowCard)
//    slotId       cfg.slots key to assign; null when adding a custom row
//    typeFilter   field types to list (["temp"], ["rpm"], …); null = all
//    includeLinux also list the Linux device's channels
//    newRowCard   card id: create a new custom row there for the chosen sensor
// ═══════════════════════════════════════════════════════════════
const _pickerBody = () => document.getElementById("picker-body");
const _showPicker = () => document.getElementById("picker").classList.remove("hide");

// Accent-styled action row ("× Clear assignment", "Skip — …").
function _pickerActionRow(text, onClick) {
  const row = el("div", "picker-clr");
  row.innerHTML = `<span>${text}</span>`;
  row.onclick = onClick;
  return row;
}

// Sensor list grouped under device headers. Returns the number of sensors listed.
function _appendLeafGroups(body, leaves, onPick, currentKey = null) {
  const byDev = {};
  for (const leaf of leaves) (byDev[leaf.dLbl] ??= []).push(leaf);

  for (const [devLbl, devLeaves] of Object.entries(byDev)) {
    const sec = el("div", "picker-sec");
    sec.textContent = devLbl;
    body.appendChild(sec);

    for (const leaf of devLeaves) {
      const row = el("div", "picker-leaf");
      if (leafKey(leaf) === currentKey) row.classList.add("sel");
      row.innerHTML = `<span class="picker-leaf-name">${esc(leaf.sensorName ?? leaf.name)}</span>
<span class="picker-leaf-val">${fmt1(leaf.value, leaf.unit)}</span>
<span class="picker-leaf-unit">${esc(leaf.unit)}</span>`;
      row.onclick = () => onPick(leaf);
      body.appendChild(row);
    }
  }
  return leaves.length;
}

function _appendEmptyNote(body, text) {
  const emp = el("div", "picker-empty");
  emp.textContent = text;
  body.appendChild(emp);
}

// Applies a picked sensor; returns the sid it was assigned to.
function _assignPickedLeaf(leaf, slotId, newRowCard) {
  if (newRowCard) return addCustomRow(newRowCard, leaf);
  cfg.slots[slotId] = { ...leaf };
  // Remapping a custom row: re-derive its mode so a row moved onto or off a
  // fan channel gets meter dots instead of keeping its old mode.
  if (slotId?.startsWith("custom_")) {
    const r = _findCustomRow(slotId);
    if (r) r.mode = _isFanLike(leaf) ? "meter" : "warn";
  }
  return slotId;
}

// Folder-size sensor: either a new custom row, or a remap of an existing one.
function _assignFolder(path, lbl, slotId, newRowCard) {
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
    const row = {
      sid: _newCustomSid(newRowCard),
      lbl,
      noPlot: true,
      custom: true,
      kind: "folder",
      path,
    };
    _registerCustomRow(newRowCard, row, slot);
  } else {
    cfg.slots[slotId] = slot;
    const r = _findCustomRow(slotId);
    if (r) {
      r.kind = "folder";
      r.path = path;
    }
  }
}

function openPicker(slotId, typeFilter, includeLinux = false, newRowCard = null) {
  const titleEl = document.getElementById("picker-title");
  if (newRowCard) {
    const cardMeta = CARD_DEFS.find((d) => d.id === newRowCard);
    titleEl.textContent =
      "Add Row — " + (cardMeta ? cardLabel(cardMeta) : newRowCard);
  } else {
    const slotMeta = SLOTS.find((s) => s.id === slotId);
    titleEl.textContent =
      "Assign " + (slotMeta?.lbl ?? _customRowLabel(slotId) ?? slotId ?? "");
  }

  const body = _pickerBody();
  body.innerHTML = "";

  if (!newRowCard && slotId && cfg.slots[slotId]) {
    body.appendChild(
      _pickerActionRow("× Clear assignment", () => {
        delete cfg.slots[slotId];
        saveCfg();
        closePicker();
        rebuildDashboard();
      }),
    );
  }

  // Remapping an autoLinux row passes includeLinux so any source is pickable.
  const leaves = buildLeaves(liveDevices).filter(
    (l) => includeLinux || l.uid !== "linux-system",
  );
  const filtered = typeFilter
    ? leaves.filter(
        (l) =>
          (l.kind === "temp" && typeFilter.includes("temp")) ||
          (l.kind === "channel" && typeFilter.includes(l.field)),
      )
    : leaves;

  if (!filtered.length) {
    _appendEmptyNote(body, "No matching channels found");
  } else {
    const currentKey =
      !newRowCard && slotId && cfg.slots[slotId] ? slotKey(cfg.slots[slotId]) : null;

    _appendLeafGroups(
      body,
      filtered,
      (leaf) => {
        const targetSid = _assignPickedLeaf(leaf, slotId, newRowCard);
        saveCfg();

        // An RPM channel gets a second step to pair it with a duty channel
        // (or a manual max RPM) — offered even when a same-object duty field
        // was auto-detected, since that one isn't always this fan's.
        if (leaf.field === "rpm") {
          const hasNativeDuty = leaves.some(
            (l) =>
              l.kind === "channel" &&
              l.uid === leaf.uid &&
              l.name === leaf.name &&
              l.field === "duty",
          );
          openDutyPairingStep(targetSid, hasNativeDuty);
          return;
        }

        closePicker();
        rebuildDashboard();
      },
      currentKey,
    );
  }

  // Folder sizes can back any custom row: a new one, or a remap of one.
  if (newRowCard || slotId?.startsWith("custom_")) {
    const folderSec = el("div", "picker-sec");
    folderSec.textContent = "Folder Size";
    body.appendChild(folderSec);

    const folderOpt = el("div", "picker-add");
    folderOpt.textContent = "+ Monitor folder path…";
    folderOpt.onclick = () => {
      pickFolder(async (path) => {
        const defaultLbl = pathLabel(path);
        const rawLbl = await showTextPrompt({
          title: "Label This Folder",
          label: "Label",
          defaultValue: defaultLbl,
        });
        if (rawLbl === null) return; // cancelled
        _assignFolder(path, rawLbl.trim() || defaultLbl, slotId, newRowCard);
        saveCfg();
        closePicker();
        _sendFolderPaths();
        rebuildDashboard();
      });
    };
    body.appendChild(folderOpt);
  }

  _showPicker();
}

// Second picker step after assigning an RPM channel: point at the channel
// that reports this fan's duty% (on motherboard/hwmon headers it's often a
// separate channel, sometimes under another device), or enter a max-RPM
// ceiling. One source is active at a time; choosing one clears the others.
function openDutyPairingStep(targetSid, hasNativeDuty) {
  document.getElementById("picker-title").textContent =
    "Match Duty Channel (optional)";
  const body = _pickerBody();
  body.innerHTML = "";

  const choose = (applyChoice) => {
    const s = cfg.slots[targetSid];
    if (s) {
      delete s.pairedDuty;
      delete s.manualMaxRpm;
    }
    applyChoice?.(cfg.slots[targetSid]);
    saveCfg();
    closePicker();
    rebuildDashboard();
  };

  body.appendChild(
    _pickerActionRow(
      hasNativeDuty
        ? "✓ Use auto-detected duty channel"
        : "Skip — estimate from RPM instead",
      () => choose(),
    ),
  );

  const manual = el("div", "picker-add");
  manual.textContent = "+ Enter max RPM manually";
  manual.onclick = async () => {
    const raw = await showTextPrompt({
      title: "Manual Max RPM",
      label: "Max RPM at 100% duty (e.g. from its spec sheet)",
      validate: (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0 ? null : "Enter a positive number.";
      },
    });
    if (raw === null) return; // cancelled: stay on this step
    const max = parseFloat(raw);
    choose((slot) => (slot.manualMaxRpm = max));
  };
  body.appendChild(manual);

  // An auto-detected duty on the fan's own channel is offered above already.
  const rpmSlot = cfg.slots[targetSid];
  const dutyLeaves = buildLeaves(liveDevices).filter(
    (l) =>
      l.kind === "channel" &&
      l.field === "duty" &&
      !(l.uid === rpmSlot?.uid && l.name === rpmSlot?.name),
  );

  if (!dutyLeaves.length) {
    _appendEmptyNote(
      body,
      hasNativeDuty
        ? "No other duty channels found"
        : "No duty channels found — enter a max RPM above, or skip to estimate automatically",
    );
  } else {
    _appendLeafGroups(body, dutyLeaves, (leaf) =>
      choose((slot) => (slot.pairedDuty = { uid: leaf.uid, name: leaf.name })),
    );
  }

  _showPicker();
}

function closePicker() {
  document.getElementById("picker")?.classList.add("hide");
}

document.getElementById("picker-close").onclick = () => closePicker();
