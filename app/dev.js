/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — dev.js  (LOCAL ONLY: keep it in .gitignore)
   monitor.html loads this if it sits next to it and silently skips it if not,
   so deleting or ignoring the file ships a clean app.

   Adds: a "Dev" zone in the drawer (demo scenarios, enter/exit Demo Mode,
   simulate first launch), theme auto-cycling, and an optional hard-wired
   connection. The core calls these hooks through _dev() in state.js:
     init          after loadCfg(), before the first render
     demoChanged   Demo Mode started, stopped or the drawer re-synced
     themeChosen   the user picked a theme by hand
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

(() => {
  // Optional: skip the connect form while developing.
  const DEV_URL = "";
  const DEV_TOKEN = "";

  const CYCLE_MS = 6000;
  let cycleTimer = null;

  // ── Demo scenarios ───────────────────────────────────────────
  const EXTRA_SCENARIOS = {
    idle: {
      label: "Idle",
      cpuLoad: { kind: "normal", min: 2, max: 30, target: 6 },
      gpuLoad: { kind: "normal", min: 1, max: 18, target: 3 },
      ram: { min: 20, max: 38, target: 26 },
      swap: { min: 0, max: 3, target: 0.4 },
      netRx: { kind: "normal", min: 5, max: 300, target: 35 },
      netTx: { kind: "normal", min: 2, max: 100, target: 15 },
    },
    gaming: {
      label: "Gaming",
      cpuLoad: { kind: "gaming", min: 25, max: 100, burstChance: 0.65 },
      gpuLoad: { kind: "gaming", min: 30, max: 100, burstChance: 0.7 },
      ram: { min: 45, max: 88, target: 62 },
      swap: { min: 0, max: 20, target: 4 },
      netRx: { kind: "gaming", min: 200, max: 12000, burstChance: 0.55 },
      netTx: { kind: "gaming", min: 100, max: 2000, burstChance: 0.55 },
    },
    stress: {
      label: "Stress",
      cpuLoad: { kind: "normal", min: 88, max: 100, target: 97 },
      gpuLoad: { kind: "normal", min: 85, max: 100, target: 96 },
      ram: { min: 70, max: 95, target: 88 },
      swap: { min: 10, max: 45, target: 25 },
      netRx: { kind: "normal", min: 3000, max: 9500, target: 6000 },
      netTx: { kind: "normal", min: 400, max: 1800, target: 900 },
    },
  };

  // Registers the extra scenarios, keeping the buttons in a sensible order.
  function addScenarios() {
    const ordered = {
      idle: EXTRA_SCENARIOS.idle,
      normal: DEMO_SCENARIOS.normal,
      gaming: EXTRA_SCENARIOS.gaming,
      stress: EXTRA_SCENARIOS.stress,
    };
    for (const k of Object.keys(DEMO_SCENARIOS)) delete DEMO_SCENARIOS[k];
    Object.assign(DEMO_SCENARIOS, ordered);
  }

  // Switches scenario; if Demo Mode is running, rebuilds the curves and ticks
  // at once so the change shows immediately.
  function setScenario(key) {
    if (!DEMO_SCENARIOS[key]) return;
    demoScenario = key;
    cfg.demoScenario = key;
    saveCfg();
    refresh();
    if (demoMode) {
      demoCurves = _buildDemoCurves(demoScenario);
      demoTick();
    }
  }

  // One glyph per demo scenario (the strip is icon-only; labels are tooltips).
  const SCENARIO_ICONS = {
    idle: _svgIcon(1.3, `<path d="M9.8 7.3A4.3 4.3 0 1 1 4.7 2.2a3.4 3.4 0 0 0 5.1 5.1z"/>`),
    normal: _svgIcon(1.3, `<polyline points="1,6 3.5,6 5,2.5 7,9.5 8.5,6 11,6"/>`),
    gaming: _svgIcon(1.3, `<rect x="1" y="3.5" width="10" height="5.5" rx="2.6"/><path d="M3.6 6.25h2.2M4.7 5.15v2.2"/><path d="M8 5.6h.01M9.2 6.9h.01"/>`),
    stress: _svgIcon(1.3, `<polygon points="7,1 3,6.6 5.7,6.6 5,11 9,5.2 6.3,5.2"/>`),
  };

  // ── Drawer: "Dev" zone ───────────────────────────────────────
  function buildZone() {
    const drawer = document.querySelector(".drawer-inner");
    if (!drawer) return;
    const hdr = el("div", "zone-hdr");
    hdr.textContent = "Dev";
    const grp = el("div", "zone-group");
    grp.innerHTML = `
      <div class="ctl-row">
        <div class="grp-hdr">Demo</div>
        <div class="size-seg" id="dev-scenarios"></div>
      </div>
      <div class="grp-body" style="margin-top:10px">
        <button class="btn btn-s" id="dev-demo-toggle"></button>
      </div>
      <div class="grp-hdr">First launch</div>
      <div class="grp-body">
        <button class="btn btn-s" id="dev-first-launch"
          title="Clears only the saved token; theme, layout and sensors stay">
          Simulate first launch
        </button>
      </div>`;
    drawer.append(hdr, grp);

    const strip = grp.querySelector("#dev-scenarios");
    for (const [key, s] of Object.entries(DEMO_SCENARIOS)) {
      const b = el("button", "size-btn");
      b.dataset.scenario = key;
      // Icon-only: four text labels don't fit the shared 176px strip.
      b.innerHTML = SCENARIO_ICONS[key] ?? s.label;
      b.title = s.label;
      b.setAttribute("aria-label", s.label);
      b.onclick = () => setScenario(key);
      strip.appendChild(b);
    }
    grp.querySelector("#dev-first-launch").onclick = () => {
      if (!confirm("Simulate a first launch? Clears only the saved token.")) return;
      cfg.token = "";
      saveCfg();
      location.reload();
    };
    refresh();
  }

  // Keeps the scenario highlight and the Enter/Exit button in step with state.
  function refresh() {
    document.querySelectorAll("#dev-scenarios .size-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.scenario === demoScenario);
    });
    const t = document.getElementById("dev-demo-toggle");
    if (t) {
      t.textContent = demoMode ? "Exit Demo Mode" : "Enter Demo Mode";
      t.onclick = demoMode ? exitDemoMode : enterDemoMode;
    }
  }

  // ── Theme auto-cycle (button joins the Theme header) ─────────
  function cycleNext() {
    const keys = Object.keys(THEMES);
    if (!keys.length) return;
    _applyThemeChoice(keys[(keys.indexOf(cfg.theme) + 1) % keys.length]);
  }

  function setCycling(on, { immediate = true } = {}) {
    cfg.themeCycling = on;
    saveCfg();
    clearInterval(cycleTimer);
    cycleTimer = null;
    if (on) {
      if (immediate) cycleNext();
      cycleTimer = setInterval(cycleNext, CYCLE_MS);
    }
    const btn = document.getElementById("btn-theme-cycle");
    if (btn) {
      btn.classList.toggle("on", on);
      btn.title = on ? "Stop auto-cycling themes" : "Auto-cycle through themes";
    }
  }

  function buildCycleButton() {
    const actions = document.querySelector("#btn-theme-shuffle")?.parentElement;
    if (!actions) return;
    const btn = el("button", "grp-hdr-icon-btn");
    btn.id = "btn-theme-cycle";
    btn.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor"
      stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1.5 6a4.5 4.5 0 0 1 7.6-3.2" /><path d="M10.5 6a4.5 4.5 0 0 1-7.6 3.2" />
      <path d="M9.6 1.5v2.3h-2.3" /><path d="M2.4 10.5v-2.3h2.3" /></svg>`;
    btn.onclick = () => setCycling(!cycleTimer);
    actions.appendChild(btn);
    btn.title = "Auto-cycle through themes";
  }

  // ── Hooks the core calls ─────────────────────────────────────
  window.dev = {
    init() {
      if (DEV_URL) cfg.baseUrl = DEV_URL;
      if (DEV_TOKEN) cfg.token = DEV_TOKEN;
      addScenarios();
      demoScenario = cfg.demoScenario || "normal";
      buildZone();
      buildCycleButton();
      if (cfg.themeCycling) setCycling(true, { immediate: false });
    },
    demoChanged: refresh,
    themeChosen() {
      if (cycleTimer) setCycling(false);
    },
  };
})();
