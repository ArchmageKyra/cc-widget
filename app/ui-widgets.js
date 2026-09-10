/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — ui-widgets.js
   ────────────────────────────────────────────────────────────────────────────
   Per-row interactive widgetry shared across cards: display-style cycling,
   the "⋯" row menu, hover sub-tooltips, user-added custom rows, and the
   sensor picker overlay used to assign/reassign any of them.
   Depends on: themes.js, state.js (must load first).
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

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
// Builds a "⋯" menu's segmented-control entry for cycling a row's
// display style — shared by the custom-row and hardcoded-row menus.
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

