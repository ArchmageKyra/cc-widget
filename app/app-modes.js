/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — app-modes.js
   Screens and modes layered on the dashboard: boot sequence, reset/import/
   export, Demo Mode, the theme builder, and theme cycling/shuffle. Ends with
   the boot IIFE, so this file must load LAST (boot() calls into every other file).
   Depends on: themes.js, state.js, platform-linux.js, ui-widgets.js, dashboard.js.
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════════
//  STARTUP / BOOT UI
// ═══════════════════════════════════════════════════════════════

const BOOT_MIN_TIME = 450;

// How long the finished dashboard ("Online") stays up before the boot screen fades.
const BOOT_READ_DELAY = 2000;

const bootStarted = {};

// Resolves once the first Linux stats sample arrives, or after 3 s (e.g.
// psutil missing). Python's push runs on its own 2 s timer, independent of
// SSE, and boot's final resize needs both.
let _resolveLinuxStatsReady;
const linuxStatsReady = new Promise((resolve) => {
  _resolveLinuxStatsReady = resolve;
});
setTimeout(() => _resolveLinuxStatsReady?.(), 3000);

// Boot checklist order, and the progress-bar % at each step's active/done
// states — one table so the bar and checklist can't drift apart.
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

// Marks a step "done" after it has been "active" for at least BOOT_MIN_TIME,
// so fast steps still register on screen.
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

// Upper bound on the boot screen: if the daemon never answers (SSE retries
// forever) it would otherwise cover the UI indefinitely.
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
    // Two frames, so a settled frame at the new size is painted before the fade.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        boot.classList.add("hide");
        setTimeout(() => boot.remove(), 450);
      });
    });
  };

  // launch.py calls this once the native window reaches its target size (see
  // on_window_configure()); the timer is a backstop if that signal never comes.
  window.__onResizeApplied = reveal;
  fallbackTimer = setTimeout(reveal, 400);

  autoResize(true);
}


// ═══════════════════════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════════════════════
// Clears only the saved token, so the next boot behaves like a first launch
// (Demo Mode, drawer open) while theme, layout and assignments stay. Dev aid.
function softResetWidget() {
  if (
    !confirm(
      "Simulate a first launch? This clears only your saved connection token — theme, layout, and sensor assignments stay put.",
    )
  )
    return;
  cfg.token = "";
  saveCfg();
  location.reload();
}

// Clears all local config and reloads as a brand-new install.
function resetWidget() {
  if (!confirm("Clear saved settings and token?")) return;
  localStorage.clear();
  location.reload();
}

// Hands cfg to Python, which adds the window position and opens a native
// Save dialog. Python does the actual write.
function exportSettings() {
  gtksend("export-settings:" + JSON.stringify(cfg));
}

// Confirms up front, then has Python open a native Open dialog; a valid file
// overwrites the current config.
function importSettings() {
  if (
    !confirm(
      "Import settings from a file? This will overwrite your current theme, layout, and window position.",
    )
  )
    return;
  gtksend("import-settings");
}

// Called by Python after a valid file is picked and the window repositioned.
// Store the config and reload; boot renders it like any launch.
window.onSettingsImported = function (ccm) {
  localStorage.setItem("ccm", JSON.stringify(ccm));
  location.reload();
};

// Starts a real connection from cfg.baseUrl/cfg.token (the only way into live
// data), ending Demo Mode first. The saved layout stays up, showing "--"
// until the first packet flips the status to "Live".
function connectNow() {
  if (!cfg.token) return;
  if (demoMode) _teardownDemoState();
  phase = "connecting";
  _connectTime = 0; // restart the uptime clock
  const _upEl = document.getElementById("sbar-uptime");
  if (_upEl) _upEl.textContent = "";
  setStatus("spin", "Connecting…");
  _updateDemoButtons();
  rebuildDashboard();
  startSSE();
}


// ═══════════════════════════════════════════════════════════════
//  DEMO MODE
//  Fakes both data sources (CC's SSE devices and Python's Linux stats) with
//  self-running curves, so the dashboard and theme editor can be previewed
//  without a daemon. Pure client-side; no network or GTK calls.
//
//  Coverage is deliberately broad: one leaf per sensor kind (temp/rpm/duty/
//  watts), several disks and fake folder sizes, so every picker path has
//  something to bind to. DEMO_SCENARIOS swap the load curves; temps, fans and
//  power cascade from load (see _computeDemoFrame()).
// ═══════════════════════════════════════════════════════════════
const DEMO_TICK_MS = 1500;

function _jitter(amp) {
  return (Math.random() - 0.5) * 2 * amp;
}

// A self-advancing curve. `kind`:
//   "sine"   — smooth periodic wave
//   "normal" — mean-reverting drift
//   "gaming" — bursty: idles low, then holds a high plateau; burstChance is
//              how often it picks the plateau over idle
class DemoCurve {
  constructor(kind, { min, max, period = 60, target, burstChance = 0.2 } = {}) {
    this.kind = kind;
    this.min = min;
    this.max = max;
    this.period = period;
    this.target = target ?? (min + max) / 2;
    this.burstChance = burstChance;
    this.t = Math.random() * period; // stagger multiple curves
    this.value = this.target;
    this.burstUntil = 0;
    this.burstTarget = this.target;
  }
  next(dt = DEMO_TICK_MS / 1000) {
    this.t += dt;
    const { min, max } = this;
    if (this.kind === "sine") {
      const v = (Math.sin((2 * Math.PI * this.t) / this.period) + 1) / 2;
      this.value = min + v * (max - min);
    } else if (this.kind === "normal") {
      const jitter = (max - min) * 0.04;
      this.value = _clamp(
        this.value + (this.target - this.value) * 0.05 + _jitter(jitter),
        min,
        max,
      );
    } else if (this.kind === "gaming") {
      if (this.t > this.burstUntil) {
        if (Math.random() < this.burstChance) {
          // Start a sustained high-load "gaming session"
          this.burstUntil = this.t + 8 + Math.random() * 14;
          this.burstTarget = min + (max - min) * (0.72 + Math.random() * 0.26);
        } else {
          // Back to idle for a while
          this.burstUntil = this.t + 4 + Math.random() * 8;
          this.burstTarget = min + (max - min) * (Math.random() * 0.2);
        }
      }
      const jitter = (max - min) * 0.06;
      this.value = _clamp(
        this.value + (this.burstTarget - this.value) * 0.22 + _jitter(jitter),
        min,
        max,
      );
    }
    return this.value;
  }
}

// Per-scenario load curves. Disks, folders, ambient and NVMe temp are the
// same in every scenario.
const DEMO_SCENARIOS = {
  idle: {
    label: "Idle",
    cpuLoad: { kind: "normal", min: 2, max: 30, target: 6 },
    gpuLoad: { kind: "normal", min: 1, max: 18, target: 3 },
    ram: { min: 20, max: 38, target: 26 },
    swap: { min: 0, max: 3, target: 0.4 },
    netRx: { kind: "normal", min: 5, max: 300, target: 35 },
    netTx: { kind: "normal", min: 2, max: 100, target: 15 },
  },
  normal: {
    label: "Normal",
    cpuLoad: { kind: "gaming", min: 3, max: 98, burstChance: 0.2 },
    gpuLoad: { kind: "sine", min: 6, max: 92, period: 45 },
    ram: { min: 26, max: 80, target: 48 },
    swap: { min: 0, max: 14, target: 2 },
    netRx: { kind: "gaming", min: 15, max: 8500, burstChance: 0.2 },
    netTx: { kind: "gaming", min: 10, max: 1100, burstChance: 0.2 },
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

// One DemoCurve per data channel (unknown scenario keys fall back to "normal").
function _buildDemoCurves(scenarioKey = demoScenario) {
  const s = DEMO_SCENARIOS[scenarioKey] || DEMO_SCENARIOS.normal;
  return {
    cpuLoad: new DemoCurve(s.cpuLoad.kind, s.cpuLoad),
    gpuLoad: new DemoCurve(s.gpuLoad.kind, s.gpuLoad),
    ram: new DemoCurve("normal", s.ram),
    swap: new DemoCurve("normal", s.swap),
    netRx: new DemoCurve(s.netRx.kind, s.netRx),
    netTx: new DemoCurve(s.netTx.kind, s.netTx),
    // Scenario-independent — always-on coverage for custom-row testing.
    disk: new DemoCurve("normal", { min: 57, max: 64, target: 60 }),
    diskHome: new DemoCurve("normal", { min: 40, max: 78, target: 55 }),
    diskData: new DemoCurve("normal", { min: 20, max: 90, target: 45 }),
    caseTemp: new DemoCurve("sine", { min: 23, max: 33, period: 90 }),
    nvmeTemp: new DemoCurve("normal", { min: 32, max: 58, target: 40 }),
    folderA: new DemoCurve("normal", { min: 8, max: 20, target: 12 }),
    folderB: new DemoCurve("normal", { min: 1, max: 6, target: 3 }),
  };
}

// Advances every curve one tick, shaped like real CC devices and Linux stats.
function _computeDemoFrame() {
  const c = demoCurves;

  const cpuLoad = c.cpuLoad.next();
  const cpuTemp = _clamp(33 + cpuLoad * 0.42 + _jitter(1.2), 30, 88);
  const cpuFan = Math.round(_clamp(500 + cpuLoad * 14 + _jitter(40), 400, 2400));
  const cpuPower = _clamp(15 + cpuLoad * 0.85 + _jitter(3), 10, 105);

  const gpuLoad = c.gpuLoad.next();
  const gpuTemp = _clamp(31 + gpuLoad * 0.48 + _jitter(1), 28, 85);
  const gpuMemTemp = _clamp(gpuTemp - 3 + _jitter(1), 25, 92);
  const gpuFan = Math.round(_clamp(400 + gpuLoad * 15 + _jitter(40), 300, 2600));
  const gpuPower = _clamp(20 + gpuLoad * 2.4 + _jitter(6), 15, 340);

  const caseTemp = c.caseTemp.next();
  const vrmTemp = _clamp(32 + cpuLoad * 0.38 + _jitter(1.5), 30, 82);
  const pumpRpm = Math.round(
    _clamp(1300 + cpuLoad * 3 + gpuLoad * 2 + _jitter(25), 1100, 2300),
  );
  const loadPeak = Math.max(cpuLoad, gpuLoad);
  const caseFan1 = Math.round(_clamp(450 + loadPeak * 8 + _jitter(25), 350, 1500));
  const caseFan2 = Math.round(_clamp(420 + loadPeak * 7.5 + _jitter(25), 350, 1450));
  const nvmeTemp = c.nvmeTemp.next();

  const now = new Date().toISOString();
  const ccDevices = [
    {
      uid: "demo-cpu",
      d_type: "CPU",
      type_index: 0,
      status_history: [
        {
          timestamp: now,
          temps: [{ name: "cpu_pkg", temp: +cpuTemp.toFixed(1) }],
          channels: [
            { name: "cpu_fan", rpm: cpuFan },
            { name: "cpu_power", watts: +cpuPower.toFixed(1) },
          ],
        },
      ],
    },
    {
      uid: "demo-gpu",
      d_type: "GPU",
      type_index: 0,
      status_history: [
        {
          timestamp: now,
          temps: [
            { name: "gpu_core", temp: +gpuTemp.toFixed(1) },
            { name: "gpu_mem", temp: +gpuMemTemp.toFixed(1) },
          ],
          channels: [
            { name: "gpu_fan", rpm: gpuFan },
            { name: "gpu_core_load", duty: +gpuLoad.toFixed(1) },
            { name: "gpu_power", watts: +gpuPower.toFixed(1) },
          ],
        },
      ],
    },
    {
      uid: "demo-chassis",
      d_type: "Liquidctl",
      type_index: 0,
      status_history: [
        {
          timestamp: now,
          temps: [
            { name: "ambient", temp: +caseTemp.toFixed(1) },
            { name: "vrm", temp: +vrmTemp.toFixed(1) },
          ],
          channels: [
            { name: "pump", rpm: pumpRpm },
            { name: "case_fan_1", rpm: caseFan1 },
            { name: "case_fan_2", rpm: caseFan2 },
          ],
        },
      ],
    },
    {
      uid: "demo-storage",
      d_type: "NVMe",
      type_index: 0,
      status_history: [
        {
          timestamp: now,
          temps: [{ name: "nvme_composite", temp: +nvmeTemp.toFixed(1) }],
          channels: [],
        },
      ],
    },
  ];

  const ramPct = c.ram.next();
  const ramTotal = 31.3;
  const ramUsed = +((ramTotal * ramPct) / 100).toFixed(1);
  const swapPct = c.swap.next();
  const swapTotal = 8;
  const swapUsed = +((swapTotal * swapPct) / 100).toFixed(2);

  const diskPct = c.disk.next();
  const diskTotal = 476.9;
  const diskUsed = +((diskTotal * diskPct) / 100).toFixed(1);
  const diskHomePct = c.diskHome.next();
  const diskHomeTotal = 931.5;
  const diskHomeUsed = +((diskHomeTotal * diskHomePct) / 100).toFixed(1);
  const diskDataPct = c.diskData.next();
  const diskDataTotal = 1863.0;
  const diskDataUsed = +((diskDataTotal * diskDataPct) / 100).toFixed(1);

  const linuxStats = {
    cpu_percent: +cpuLoad.toFixed(1),
    ram_percent: +ramPct.toFixed(1),
    ram_used_gb: ramUsed,
    ram_free_gb: +(ramTotal - ramUsed).toFixed(1),
    ram_total_gb: ramTotal,
    swap_percent: +swapPct.toFixed(1),
    swap_used_gb: swapUsed,
    swap_total_gb: swapTotal,
    disks: {
      "/": {
        percent: +diskPct.toFixed(1),
        used_gb: diskUsed,
        free_gb: +(diskTotal - diskUsed).toFixed(1),
        total_gb: diskTotal,
      },
      "/home": {
        percent: +diskHomePct.toFixed(1),
        used_gb: diskHomeUsed,
        free_gb: +(diskHomeTotal - diskHomeUsed).toFixed(1),
        total_gb: diskHomeTotal,
      },
      "/mnt/data": {
        percent: +diskDataPct.toFixed(1),
        used_gb: diskDataUsed,
        free_gb: +(diskDataTotal - diskDataUsed).toFixed(1),
        total_gb: diskDataTotal,
      },
    },
    net: {
      rx_kbps: Math.round(c.netRx.next()),
      tx_kbps: Math.round(c.netTx.next()),
    },
    folder_sizes: {
      "/home/user/Downloads": +c.folderA.next().toFixed(1),
      "/var/log": +c.folderB.next().toFixed(1),
    },
  };

  return { ccDevices, linuxStats };
}

// Feeds one fake frame through the real CC/Linux pipeline.
function demoTick() {
  const { ccDevices: fakeCc, linuxStats } = _computeDemoFrame();
  ccDevices = fakeCc;
  refreshDevices();
  applyLinuxStats(linuxStats);
  if (phase === "dashboard") setStatus("ok");
}

// cfg.slots entries enterDemoMode() overwrites; undefined = was unassigned.
let _demoSlotBackup = null;
const DEMO_CC_SIDS = ["cpu_temp", "cpu_fan", "gpu_temp", "gpu_load", "gpu_fan", "case_temp"];

// The drawer's Connection button toggles Demo Mode.
function _updateDemoButtons() {
  const drawerBtn = document.getElementById("btn-demo-drawer");
  if (drawerBtn) {
    drawerBtn.textContent = demoMode ? "Exit Demo Mode" : "Enter Demo Mode";
    drawerBtn.onclick = demoMode ? exitDemoMode : enterDemoMode;
  }
  document.querySelectorAll("#demo-scenario-btns .size-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.scenario === demoScenario);
  });
}

// Pulses the token field to draw a first-time user's eye to it.
function _flashTokenField() {
  const inp = document.getElementById("tc-tok");
  if (!inp) return;
  inp.classList.add("flash-attn");
  setTimeout(() => inp.classList.remove("flash-attn"), 2700);
}

// Switches scenario; if Demo Mode is running, rebuilds the curves and ticks
// immediately so the change shows at once.
function setDemoScenario(key) {
  if (!DEMO_SCENARIOS[key] || key === demoScenario) {
    demoScenario = key;
    _updateDemoButtons();
    return;
  }
  demoScenario = key;
  cfg.demoScenario = key;
  saveCfg();
  _updateDemoButtons();
  if (demoMode) {
    demoCurves = _buildDemoCurves(demoScenario);
    demoTick();
  }
}

function enterDemoMode() {
  if (demoMode) return;
  demoMode = true;

  // A real connection may be live: stop it and stash its assignments so
  // exiting can restore them.
  stopSSE();
  _demoSlotBackup = {};
  for (const sid of DEMO_CC_SIDS) _demoSlotBackup[sid] = cfg.slots[sid];

  demoCurves = _buildDemoCurves(demoScenario);

  // Seed a frame so the CC-side slots (not auto-assigned like Linux stats)
  // have something to bind to before the first buildCards().
  const { ccDevices: fakeCc, linuxStats } = _computeDemoFrame();
  ccDevices = fakeCc;
  const leaves = buildLeaves(ccDevices);
  const findLeaf = (uid, kind, name, field) =>
    leaves.find(
      (l) =>
        l.uid === uid &&
        l.kind === kind &&
        l.name === name &&
        (field ? l.field === field : true),
    );
  const bind = (sid, uid, kind, name, field) => {
    const leaf = findLeaf(uid, kind, name, field);
    if (leaf) cfg.slots[sid] = { ...leaf };
  };
  bind("cpu_temp", "demo-cpu", "temp", "cpu_pkg");
  bind("cpu_fan", "demo-cpu", "channel", "cpu_fan", "rpm");
  bind("gpu_temp", "demo-gpu", "temp", "gpu_core");
  bind("gpu_load", "demo-gpu", "channel", "gpu_core_load", "duty");
  bind("gpu_fan", "demo-gpu", "channel", "gpu_fan", "rpm");
  bind("case_temp", "demo-chassis", "temp", "ambient");

  refreshDevices();
  applyLinuxStats(linuxStats); // also autoAssignLinux() (no-op for sids already assigned)

  phase = "dashboard";

  // Always land on a clean dashboard: no edit mode, drawer closed.
  editMode = false;
  _syncEditChrome();
  drawerOpen = false;
  _drawer?.classList.remove("open");

  buildCards();
  showScreen();
  setStatus("ok");
  if (!_connectTime) _connectTime = Date.now();

  _updateDemoButtons();

  if (demoTimer) clearInterval(demoTimer);
  demoTimer = setInterval(demoTick, DEMO_TICK_MS);
}

// Stops the tick timer, drops fake devices, restores cfg.slots. Shared by
// exitDemoMode() and connectNow().
function _teardownDemoState() {
  demoMode = false;
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
  }
  demoCurves = null;
  ccDevices = [];
  linuxDevices = [];
  liveDevices = [];
  if (_demoSlotBackup) {
    for (const sid of DEMO_CC_SIDS) {
      if (_demoSlotBackup[sid] === undefined) delete cfg.slots[sid];
      else cfg.slots[sid] = _demoSlotBackup[sid];
    }
    _demoSlotBackup = null;
  }
}

function exitDemoMode() {
  if (!demoMode) return;
  _teardownDemoState();

  // A token is saved: reconnect rather than sit on a blank dashboard.
  if (cfg.token) {
    connectNow();
    return;
  }

  // No token: nothing to connect to, so reset the indicator to idle.
  _resetConnIndicator();
  _updateDemoButtons();
  rebuildDashboard();
}


// ═══════════════════════════════════════════════════════════════
//  THEME BUILDER — colour pickers that write :root CSS live to the active
//  theme. _tb* hooks are exposed so theme tiles and card menus can resync it.
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
  // Colours with a swatch + hex readout in the drawer; also what contrast is measured from.
  const CONTRAST_VARS = ["--bg", "--txt", "--txt-dim", "--hot"];
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

  // Loads bv from the live CSS vars.
  function syncBuilderFromActive() {
    for (const k of SOLID_VARS) {
      const raw = getCSSVar(k);
      if (raw && raw.startsWith("#")) bv[k] = raw;
    }
    bv["--r"] = getRadius();
    syncUIFromBv();
  }

  // Pushes bv into the drawer UI. Accent colours (--cpu, …) have no drawer
  // controls (they're edited via each card's "⋯" menu), so bv only tracks
  // them as inputs to generateCSS().
  function syncUIFromBv() {
    for (const v of CONTRAST_VARS) {
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

    for (let i = 1; i <= 5; i++) {
      const pip = document.getElementById("tbs-w" + i);
      if (pip) {
        pip.style.background = bv["--w" + i];
        const inp = pip.querySelector("input");
        if (inp) inp.value = bv["--w" + i];
      }
    }
    updateWarnGradient();

    const slider = document.getElementById("tb-radius");
    const rval = document.getElementById("tb-radius-val");
    if (slider) slider.value = bv["--r"];
    if (rval) rval.textContent = bv["--r"] + "px";

    updateContrastBadges();
  }

  function updateWarnGradient() {
    const bar = document.getElementById("tb-warn-gradient");
    if (!bar) return;
    const stops = [1, 2, 3, 4, 5].map((i) => bv["--w" + i]).join(", ");
    bar.style.background = `linear-gradient(to right, ${stops})`;
  }

  // WCAG contrast of each text colour against --bg: ok ≥ 4.5:1 (AA body
  // text), warn ≥ 3:1 (AA large text only), bad below that.
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

  document.querySelectorAll('input[type="color"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const varName = e.target.dataset.var;
      bv[varName] = e.target.value;

      const parent = e.target.closest(".tb-swatch,.tb-warn-pip");
      if (parent) parent.style.background = e.target.value;

      const key = varName.replace(/^--/, "");
      const hx = document.getElementById("tbh-" + key);
      if (hx) hx.textContent = e.target.value;

      if (/--w[0-9]/.test(varName)) updateWarnGradient();
      if (CONTRAST_VARS.includes(varName)) updateContrastBadges();

      liveApply();
    });
  });

  document.getElementById("tb-radius").addEventListener("input", (e) => {
    bv["--r"] = parseInt(e.target.value, 10);
    document.getElementById("tb-radius-val").textContent = bv["--r"] + "px";
    liveApply();
  });

  // Pickers write straight to the active theme; the textarea mirrors it as a
  // "paste your own" path.
  function liveApply() {
    const css = generateCSS();
    document.getElementById("custom-css").value = css;
    applyTheme("custom", css);
    _markActiveTile("custom");
  }

  // Full theme CSS from the builder values. Surface/border overlays are
  // white on dark backgrounds and black on light ones.
  function generateCSS() {
    const r = bv["--r"];
    const [bgR, bgG, bgB] = hexToRgb(bv["--bg"]);
    const luma = (bgR * 0.299 + bgG * 0.587 + bgB * 0.114) / 255;
    const ov = luma < 0.4 ? "255,255,255" : "0,0,0";
    const [cpuR, cpuG, cpuB] = hexToRgb(bv["--cpu"]);
    const [hotR, hotG, hotB] = hexToRgb(bv["--hot"]);
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
  // Changes one var (card-menu colour) on top of the live theme: resync bv
  // first so the rest of the theme isn't reverted to a stale buffer.
  _tbSetVar = function (varName, hex) {
    syncBuilderFromActive();
    bv[varName] = hex;
    syncUIFromBv();
    liveApply();
  };

  syncBuilderFromActive();
}


// ═══════════════════════════════════════════════════════════════
//  THEME CYCLING & SHUFFLE
//  Cycle auto-advances through THEMES on a timer to preview them all.
//  Shuffle picks a random theme at each boot. Both skip "custom", and any
//  manual theme pick stops Cycle.
// ═══════════════════════════════════════════════════════════════

// Highlights the tile for `key`.
function _markActiveTile(key) {
  document
    .querySelectorAll(".theme-tile")
    .forEach((t) => t.classList.toggle("active", t.dataset.key === key));
}

// Applies `key` and syncs tiles and builder, like clicking its tile.
function _applyThemeChoice(key) {
  _markActiveTile(key);
  document.getElementById("theme-editor-inline")?.classList.add("hide");
  applyTheme(key);
  if (_tbSync) _tbSync();
}

function _randomThemeKey() {
  const keys = Object.keys(THEMES);
  return keys[Math.floor(Math.random() * keys.length)];
}

function _cycleToNextTheme() {
  const keys = Object.keys(THEMES);
  if (!keys.length) return;
  const idx = (keys.indexOf(cfg.theme) + 1) % keys.length;
  _applyThemeChoice(keys[idx]);
}

function _updateThemeToggleButtons() {
  const cycleBtn = document.getElementById("btn-theme-cycle");
  if (cycleBtn) {
    cycleBtn.classList.toggle("on", themeCycling);
    cycleBtn.title = themeCycling
      ? "Stop auto-cycling themes"
      : "Auto-cycle through themes every few seconds";
  }
  const shuffleBtn = document.getElementById("btn-theme-shuffle");
  if (shuffleBtn) {
    shuffleBtn.classList.toggle("on", cfg.themeShuffleOnBoot);
    shuffleBtn.title = cfg.themeShuffleOnBoot
      ? "Random theme on launch — on"
      : "Pick a random theme every time the widget starts";
  }
}

function setThemeCycling(on, { immediate = true } = {}) {
  themeCycling = on;
  cfg.themeCycling = on;
  saveCfg();
  if (themeCycleTimer) {
    clearInterval(themeCycleTimer);
    themeCycleTimer = null;
  }
  if (on) {
    if (immediate) _cycleToNextTheme();
    themeCycleTimer = setInterval(_cycleToNextTheme, THEME_CYCLE_MS);
  }
  _updateThemeToggleButtons();
}

function setThemeShuffleOnBoot(on) {
  cfg.themeShuffleOnBoot = on;
  saveCfg();
  _updateThemeToggleButtons();
  // Preview now; the real effect is on the next launch.
  if (on) _applyThemeChoice(_randomThemeKey());
}

function initThemeScreen() {
  // Size
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

  // Anchor corner
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

  // Theme tiles
  const themeEditorInline = document.getElementById("theme-editor-inline");
  const g = document.getElementById("theme-grid");
  g.innerHTML = "";
  for (const [key, theme] of Object.entries(THEMES)) {
    const tile = el("div", "theme-tile");
    tile.dataset.key = key;
    if (cfg.theme === key) tile.classList.add("active");
    tile.innerHTML = `<div class="theme-swatches">${theme.swatches.map((c) => `<span class="swatch" style="background:${c}"></span>`).join("")}</div><div class="theme-name">${theme.name}</div>`;
    tile.onclick = () => {
      if (themeCycling) setThemeCycling(false);
      _markActiveTile(key);
      themeEditorInline.classList.add("hide");
      applyTheme(key);
      // Sync the builder so a following "Custom…" starts from this preset.
      if (_tbSync) _tbSync();
    };
    g.appendChild(tile);
  }

  // "Custom…" tile: active whenever cfg.theme is custom
  const customTile = el("div", "theme-tile theme-tile-custom");
  customTile.dataset.key = "custom";
  if (cfg.theme === "custom") customTile.classList.add("active");
  customTile.innerHTML = `<div class="theme-swatches-custom"><span class="tile-custom-icon">✎</span></div><div class="theme-name">Custom…</div>`;
  customTile.onclick = () => {
    if (themeCycling) setThemeCycling(false);
    _markActiveTile("custom");
    themeEditorInline.classList.remove("hide");
    // Regenerate from the live theme (kept in bv by _tbSync()), not the old
    // saved customThemeCSS, so "preset, then Custom" edits that preset.
    if (_tbGenerateCSS) applyTheme("custom", _tbGenerateCSS());
  };
  g.appendChild(customTile);

  initThemeBuilder();

  // The editor is shown exactly while the custom theme is active.
  themeEditorInline.classList.toggle("hide", cfg.theme !== "custom");
  // Connection fields start open until a token is saved; the status stays
  // visible in the collapsed summary either way.
  document.getElementById("connection-details").open = !cfg.token;

  // Share Theme (Copy / Load)
  if (cfg.customThemeCSS)
    document.getElementById("custom-css").value = cfg.customThemeCSS;

  document.getElementById("btn-theme-apply").onclick = () => {
    const css = document.getElementById("custom-css").value.trim();
    if (!css.includes("{") || !css.includes("}")) {
      alert("Paste a shared theme's :root { … } block first.");
      return;
    }
    if (themeCycling) setThemeCycling(false);
    applyTheme("custom", css);
    _markActiveTile("custom");
    if (_tbSync) _tbSync();
  };

  // Copy the CSS box. execCommand comes first: it's synchronous and needs no
  // permission, and the async Clipboard API may be missing in embedded
  // WebKitGTK. Failing both, the text stays selected for a manual copy.
  const copyBtn = document.getElementById("btn-theme-copy");
  if (copyBtn) {
    copyBtn.onclick = () => {
      const ta = document.getElementById("custom-css");
      ta.select();
      ta.setSelectionRange(0, 999999);
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      const flash = (label) => {
        copyBtn.textContent = label;
        setTimeout(() => (copyBtn.textContent = "Copy"), 1400);
      };
      if (ok) {
        flash("Copied!");
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(ta.value)
          .then(() => flash("Copied!"))
          .catch(() => flash("Select & Copy"));
      } else {
        flash("Select & Copy");
      }
    };
  }

  // Connection fields
  document.getElementById("tc-url").value = cfg.baseUrl;
  document.getElementById("tc-tok").value = cfg.token;

  // Token show/hide (the field starts as type=password in the HTML).
  const tokEye = document.getElementById("tc-tok-eye");
  tokEye.innerHTML = _ICON_EYE;
  tokEye.onclick = () => {
    const inp = document.getElementById("tc-tok");
    const revealed = inp.type === "text";
    inp.type = revealed ? "password" : "text";
    tokEye.innerHTML = revealed ? _ICON_EYE : _ICON_EYE_OFF;
    tokEye.title = revealed ? "Show token" : "Hide token";
  };

  const persist = () => {
    const u = document.getElementById("tc-url").value.trim().replace(/\/$/, "");
    const t = document.getElementById("tc-tok").value.trim();
    const changed = (u && u !== cfg.baseUrl) || (t && t !== cfg.token);
    if (u) cfg.baseUrl = u;
    if (t) cfg.token = t;
    saveCfg();
    // Connect when a token exists and something changed (or we're in Demo
    // Mode); re-entering the same values doesn't reconnect.
    if (t && (changed || demoMode)) connectNow();
  };
  document.getElementById("tc-url").onchange = persist;
  document.getElementById("tc-tok").onchange = persist;

  const cycleBtn = document.getElementById("btn-theme-cycle");
  if (cycleBtn) cycleBtn.onclick = () => setThemeCycling(!themeCycling);
  const shuffleBtn = document.getElementById("btn-theme-shuffle");
  if (shuffleBtn)
    shuffleBtn.onclick = () => setThemeShuffleOnBoot(!cfg.themeShuffleOnBoot);
  _updateThemeToggleButtons();

  const dsb = document.getElementById("demo-scenario-btns");
  if (dsb) {
    dsb.innerHTML = "";
    for (const [key, scenario] of Object.entries(DEMO_SCENARIOS)) {
      const btn = el("button", "size-btn");
      btn.dataset.scenario = key;
      btn.textContent = scenario.label;
      btn.classList.toggle("active", demoScenario === key);
      btn.onclick = () => setDemoScenario(key);
      dsb.appendChild(btn);
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
(async () => {
  // Backstop so the boot screen always clears; hideBootScreen() is idempotent.
  _bootFailsafeTimer = setTimeout(hideBootScreen, BOOT_FAILSAFE_MS);

  gtksend("boot"); // compact startup window size

  bootStep("profile", "active");
  bootState("Loading profile");

  loadCfg();
  demoScenario = cfg.demoScenario || "normal";
  if (cfg.themeCycling) setThemeCycling(true, { immediate: false });

  await waitBootStep("profile");

  bootStep("theme", "active");
  bootState("Preparing interface");

  initCardSort();
  initRowSort();

  applySize(cfg.size || "s", false);

  // Shuffle-on-boot overrides the saved theme with a random preset.
  if (cfg.themeShuffleOnBoot) {
    applyTheme(_randomThemeKey());
  } else {
    applyTheme(
      cfg.theme === "custom" ? "custom" : cfg.theme || "misty-metal",
      cfg.theme === "custom" ? cfg.customThemeCSS : null,
    );
  }

  await waitBootStep("theme");

  // Restore the saved anchor corner: bar position here, and Python's resize math.
  if (cfg.anchorCorner) {
    _applyBarPosition(cfg.anchorCorner);
    gtksend("anchor:" + cfg.anchorCorner);
  }

  document.getElementById("btn-soft-reset-drawer").onclick = softResetWidget;
  document.getElementById("btn-reset-drawer").onclick = resetWidget;
  document.getElementById("btn-export-settings").onclick = exportSettings;
  document.getElementById("btn-import-settings").onclick = importSettings;
  _updateDemoButtons();

  // New user (no token): start in Demo Mode with the drawer open at the
  // token field, rather than on a bare connect form.
  if (!cfg.token) {
    enterDemoMode();
    setConfigOpen(true);
    // Wait for the drawer's slide-in to finish before flashing the field.
    setTimeout(_flashTokenField, 500);
    hideBootScreen();
    return;
  }

  // Returning user: render the saved layout at once ("--" until the first
  // packet) while the connection catches up behind the boot checklist.
  bootStep("daemon", "active");
  bootState("Connecting");

  phase = "connecting";
  setStatus("spin", "Connecting…");
  rebuildDashboard();
  startSSE();
})();
