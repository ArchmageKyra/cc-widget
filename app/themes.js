/* ════════════════════════════════════════════════════════════════════════════
   CC Widget — themes.js
   THEMES catalogue, size presets, applyTheme() and applySize().
   To add a theme, append an entry to THEMES (the in-app Theme Builder's
   generated CSS can be pasted in as the `css` string). Unlisted tokens fall
   back to the defaults in monitor.css (which mirror Deep Space, the default
   theme), but a theme should define at least:
     --bg --txt --txt-dim --txt-muted --hot   --bdr --bhi   --r --rs
     --cpu --gpu --fan --ssd --ram --net --accent   --w1…--w5
     --meter --dot-off-warn --dot-off-meter --spark-grid --spark-vtick
     --font-ui --font-num --font-code
   Optional: --tx-ui / --tx-num (text multipliers for fonts with small glyphs)
   and surface overrides (--bg-card …); most themes inherit surfaces from
   monitor.css.
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

const THEMES = {
  "deep-space": {
    name: "Deep Space",
    swatches: ["#0d0d16", "#67b0ff", "#46dfaa", "#ff9e45", "#bcc7ff"],
    css: `:root{
  --bg:#0d0d16;
  --txt:#eef5ff;
  --txt-dim:#a5b8d6;
  --txt-muted:#3a4d68;
  --hot:#f87171;

  --bdr:rgba(255,255,255,.09);
  --bhi:rgba(255,255,255,.18);

  --r:10px; --rs:6px;

  --cpu:#67b0ff;
  --gpu:#46dfaa;
  --fan:#ff9e45;
  --ssd:#8d98ff;
  --ram:#bcc7ff;
  --net:#40dfcb;
  --accent:#67b0ff;

  --w1:#52e38c;
  --w2:#b2ec54;
  --w3:#ffc94a;
  --w4:#ff8b38;
  --w5:#ff5454;

  --meter:rgba(180,205,240,.72);
  --dot-off-warn:rgba(255,255,255,.15);
  --dot-off-meter:rgba(255,255,255,.10);
  --spark-grid:rgba(255,255,255,.08);
  --spark-vtick:rgba(255,255,255,.05);

  --font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  "misty-metal": {
    name: "Misty Metal",
    swatches: ["#1E1E22", "#0A84FF", "#32D74B", "#FF9F0A", "#BF5AF2"],
    css: `:root{
  --bg:#1E1E22;
  --txt:#EAEAEC;
  --txt-dim:#9A9AA2;
  --txt-muted:#3A3A40;
  --hot:#FF453A;

  --bg-bar:rgba(255,255,255,.045);
  --bg-overlay:rgba(255,255,255,.035);
  --bg-card:rgba(255,255,255,.045);
  --bg-card-hdr:rgba(255,255,255,.035);
  --bg-input:rgba(255,255,255,.06);
  --bg-canvas:rgba(0,0,0,.22);
  --bg-code:rgba(255,255,255,.07);
  --bg-hover:rgba(255,255,255,.07);
  --bg-hover-subtle:rgba(255,255,255,.035);
  --bg-active:rgba(255,255,255,.09);
  --bg-danger:rgba(255,69,58,.16);
  --bg-err:rgba(255,69,58,.10);
  --track-bg:rgba(255,255,255,.08);

  --bdr:rgba(255,255,255,.09);
  --bhi:rgba(255,255,255,.17);
  --bdr-err:rgba(255,69,58,.26);

  --r:16px; --rs:9px;

  --cpu:#0A84FF;
  --gpu:#32D74B;
  --fan:#FF9F0A;
  --ssd:#8280FF;
  --ram:#BF5AF2;
  --net:#64D2FF;
  --accent:#66D4CF;

  --w1:#32D74B;
  --w2:#FFD60A;
  --w3:#FF9F0A;
  --w4:#FF6961;
  --w5:#FF453A;

  --meter:rgba(10,132,255,.50);
  --dot-off-warn:rgba(234,234,236,.12);
  --dot-off-meter:rgba(234,234,236,.07);
  --spark-grid:rgba(255,255,255,.07);
  --spark-vtick:rgba(255,255,255,.04);

  --font-ui:"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;
  --font-num:"SF Mono","Menlo",ui-monospace,monospace;
  --font-code:"SF Mono","Menlo","JetBrains Mono",ui-monospace,monospace;
}`,
  },

  catppuccin: {
    name: "Catppuccin Mocha",
    swatches: ["#1e1e2e", "#89b4fa", "#a6e3a1", "#fab387", "#b4befe"],
    css: `:root{
  --bg:#1e1e2e;
  --txt:#cdd6f4;
  --txt-dim:#a6adc8;
  --txt-muted:#45475a;
  --hot:#f38ba8;

  --bdr:rgba(205,214,244,.09);
  --bhi:rgba(205,214,244,.18);

  --r:8px; --rs:5px;

  --cpu:#89b4fa;
  --gpu:#a6e3a1;
  --fan:#fab387;
  --ssd:#b4befe;
  --ram:#cdd6f4;
  --net:#94e2d5;
  --accent:#CBA6F7;

  --w1:#a6e3a1;
  --w2:#c9f27d;
  --w3:#f9e2af;
  --w4:#fab387;
  --w5:#f38ba8;

  --meter:rgba(137,180,250,.60);
  --dot-off-warn:rgba(205,214,244,.15);
  --dot-off-meter:rgba(205,214,244,.10);
  --spark-grid:rgba(205,214,244,.08);
  --spark-vtick:rgba(205,214,244,.05);

  --font-ui:"Nunito",system-ui,sans-serif;
  --font-num:"JetBrains Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  nord: {
    name: "Nord",
    swatches: ["#2e3440", "#88c0d0", "#a3be8c", "#d08770", "#81a1c1"],
    css: `:root{
  --bg:#2e3440;
  --txt:#eceff4;
  --txt-dim:#aebacf;
  --txt-muted:#434c5e;
  --hot:#bf616a;

  --bdr:rgba(216,222,233,.09);
  --bhi:rgba(216,222,233,.18);

  --r:8px; --rs:5px;

  --cpu:#88c0d0;
  --gpu:#a3be8c;
  --fan:#d08770;
  --ssd:#81a1c1;
  --ram:#c7d8e6;
  --net:#8fbcbb;
  --accent:#B48EAD;

  --w1:#a3be8c;
  --w2:#c7d59a;
  --w3:#ebcb8b;
  --w4:#d08770;
  --w5:#bf616a;

  --meter:rgba(136,192,208,.65);
  --dot-off-warn:rgba(216,222,233,.15);
  --dot-off-meter:rgba(216,222,233,.10);
  --spark-grid:rgba(216,222,233,.08);
  --spark-vtick:rgba(216,222,233,.05);

  --font-ui:"Manrope",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  gruvbox: {
    name: "Gruvbox Dark",
    swatches: ["#1d2021", "#83a598", "#b8bb26", "#fe8019", "#458588"],
    css: `:root{
  --bg:#1d2021;
  --txt:#f2e5bc;
  --txt-dim:#bdae93;
  --txt-muted:#504945;
  --hot:#fb4934;

  --bdr:rgba(235,219,178,.09);
  --bhi:rgba(235,219,178,.18);

  --r:4px; --rs:3px;

  --cpu:#83a598;
  --gpu:#b8bb26;
  --fan:#fe8019;
  --ssd:#458588;
  --ram:#8ec07c;
  --net:#fabd2f;
  --accent:#D3869B;

  --w1:#b8bb26;
  --w2:#d8d84a;
  --w3:#fabd2f;
  --w4:#fe8019;
  --w5:#fb4934;

  --meter:rgba(189,174,147,.65);
  --dot-off-warn:rgba(235,219,178,.15);
  --dot-off-meter:rgba(235,219,178,.10);
  --spark-grid:rgba(235,219,178,.08);
  --spark-vtick:rgba(235,219,178,.05);

  --font-ui:"Space Mono",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  "solarized-dark": {
    name: "Solarized Dark",
    swatches: ["#002b36", "#268bd2", "#2aa198", "#b58900", "#93a1a1"],
    css: `:root{
  --bg:#002b36;
  --txt:#eee8d5;
  --txt-dim:#93a1a1;
  --txt-muted:#586e75;
  --hot:#dc322f;

  --bdr:rgba(147,161,161,.10);
  --bhi:rgba(147,161,161,.18);

  --r:8px; --rs:5px;

  --cpu:#268bd2;
  --gpu:#2aa198;
  --fan:#b58900;
  --ssd:#6c71c4;
  --ram:#93a1a1;
  --net:#859900;
  --accent:#D33682;

  --w1:#859900;
  --w2:#2aa198;
  --w3:#b58900;
  --w4:#cb4b16;
  --w5:#dc322f;

  --meter:rgba(38,139,210,.45);
  --dot-off-warn:rgba(147,161,161,.12);
  --dot-off-meter:rgba(147,161,161,.08);
  --spark-grid:rgba(147,161,161,.07);
  --spark-vtick:rgba(147,161,161,.04);

  --font-ui:"Source Sans 3",system-ui,sans-serif;
  --font-num:"Source Code Pro",ui-monospace,monospace;
  --font-code:"Source Code Pro",ui-monospace,monospace;
  --tx-ui:1.09; --tx-num:1.12;
}`,
  },

  "tokyo-night": {
    name: "Tokyo Night",
    swatches: ["#1a1b26", "#7aa2f7", "#9ece6a", "#ff9e64", "#bb9af7"],
    css: `:root{
  --bg:#1a1b26;
  --txt:#c0caf5;
  --txt-dim:#7982a9;
  --txt-muted:#3b3f58;
  --hot:#f7768e;

  --bdr:rgba(192,202,245,.09);
  --bhi:rgba(192,202,245,.18);

  --r:8px; --rs:5px;

  --cpu:#7aa2f7;
  --gpu:#9ece6a;
  --fan:#ff9e64;
  --ssd:#bb9af7;
  --ram:#c0caf5;
  --net:#7dcfff;
  --accent:#73DACA;

  --w1:#9ece6a;
  --w2:#e0af68;
  --w3:#ff9e64;
  --w4:#f7768e;
  --w5:#db4b4b;

  --meter:rgba(122,162,247,.55);
  --dot-off-warn:rgba(192,202,245,.13);
  --dot-off-meter:rgba(192,202,245,.08);
  --spark-grid:rgba(192,202,245,.07);
  --spark-vtick:rgba(192,202,245,.04);

  --font-ui:"Inter",system-ui,sans-serif;
  --font-num:"JetBrains Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  "wandering-waters": {
    name: "Wandering Waters",
    swatches: ["#0E1614", "#D97C4A", "#7FBF6B", "#E8C97A", "#E9DAC0"],
    css: `:root{
  --bg:#0E1614;
  --txt:#F0E6D2;
  --txt-dim:#93ACA8;
  --txt-muted:#243B39;
  --hot:#D0564A;

  --bdr:rgba(147,172,168,.10);
  --bhi:rgba(147,172,168,.19);

  --r:12px; --rs:7px;

  --cpu:#D97C4A;
  --gpu:#7FBF6B;
  --fan:#B4D2D8;
  --ssd:#6FB8D9;
  --ram:#4FC7BE;
  --net:#E8C97A;
  --accent:#EBAB82;

  --w1:#7FBF6B;
  --w2:#C7D56B;
  --w3:#E8C97A;
  --w4:#D97C4A;
  --w5:#D0564A;

  --meter:rgba(180,210,216,.55);
  --dot-off-warn:rgba(240,230,210,.13);
  --dot-off-meter:rgba(240,230,210,.08);
  --spark-grid:rgba(111,184,217,.08);
  --spark-vtick:rgba(111,184,217,.04);

  --font-ui:"Space Grotesk",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  "nixie-nocturne": {
    name: "Nixie Nocturne",
    swatches: ["#101014", "#E3433B", "#F5813D", "#F3A53F", "#E2B332"],
    css: `:root{
  --bg:#101014;
  --txt:#F0E8DB;
  --txt-dim:#B4A493;
  --txt-muted:#312921;
  --hot:#F43454;

  --bdr:rgba(245,129,61,.10);
  --bhi:rgba(245,129,61,.20);

  --r:8px; --rs:5px;

  --cpu:#E3433B;
  --gpu:#ED7C5A;
  --fan:#E2B332;
  --ssd:#EBDCC2;
  --ram:#F5813D;
  --net:#F3A53F;
  --accent:#EEAC90;

  --w1:#E8D3B0;
  --w2:#F0BC42;
  --w3:#F28E36;
  --w4:#ED461D;
  --w5:#F43454;

  --meter:rgba(245,129,61,.55);
  --dot-off-warn:rgba(240,232,219,.15);
  --dot-off-meter:rgba(240,232,219,.10);
  --spark-grid:rgba(227,67,59,.07);
  --spark-vtick:rgba(227,67,59,.04);

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"VT323",ui-monospace,monospace;
  --font-code:"IBM Plex Mono",ui-monospace,monospace;
  --tx-ui:1.12; --tx-num:1.3;
}`,
  },

  "reclaimer-relay": {
    name: "Reclaimer Relay",
    swatches: ["#0A0F16", "#3FA9F5", "#2FBE86", "#F5A623", "#7C93AC"],
    css: `:root{
  --bg:#0A0F16;
  --txt:#DCEAF7;
  --txt-dim:#86A8C4;
  --txt-muted:#253549;
  --hot:#FF4433;

  --bdr:rgba(63,169,245,.10);
  --bhi:rgba(63,169,245,.20);

  --r:3px; --rs:2px;

  --cpu:#3FA9F5;
  --gpu:#2FBE86;
  --fan:#B6C7D6;
  --ssd:#657C94;
  --ram:#F0C04A;
  --net:#D89B36;
  --accent:#5CD6E8;

  --w1:#2FBE86;
  --w2:#8FB84A;
  --w3:#F5A623;
  --w4:#F2843C;
  --w5:#FF4433;

  --meter:rgba(63,169,245,.48);
  --dot-off-warn:rgba(63,169,245,.14);
  --dot-off-meter:rgba(63,169,245,.09);
  --spark-grid:rgba(47,190,134,.08);
  --spark-vtick:rgba(47,190,134,.05);

  --font-ui:"Orbitron",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"Share Tech Mono",ui-monospace,monospace;
}`,
  },

  "sangheili-signal": {
    name: "Sangheili Signal",
    swatches: ["#0C0914", "#8B5CF6", "#D63BA0", "#3B8FE0", "#7DD33D"],
    css: `:root{
  --bg:#0C0914;
  --txt:#EAD9FF;
  --txt-dim:#9683B8;
  --txt-muted:#2A1F3E;
  --hot:#FF3D6E;

  --bdr:rgba(139,92,246,.10);
  --bhi:rgba(139,92,246,.20);

  --r:12px; --rs:7px;

  --cpu:#8B5CF6;
  --gpu:#D63BA0;
  --fan:#BFE07A;
  --ssd:#3B8FE0;
  --ram:#3FC4E8;
  --net:#7DD33D;
  --accent:#E07BF0;

  --w1:#8B5CF6;
  --w2:#3FC4E8;
  --w3:#7DD33D;
  --w4:#D63BA0;
  --w5:#FF3D6E;

  --meter:rgba(139,92,246,.45);
  --dot-off-warn:rgba(139,92,246,.14);
  --dot-off-meter:rgba(139,92,246,.09);
  --spark-grid:rgba(63,196,232,.07);
  --spark-vtick:rgba(63,196,232,.04);

  --font-ui:"Offside","Rajdhani",system-ui,sans-serif;
  --font-num:"Space Mono",ui-monospace,monospace;
  --font-code:"Space Mono",ui-monospace,monospace;
}`,
  },

  "final-frontier": {
    name: "Final Frontier",
    swatches: ["#050507", "#9c9cff", "#ffcc66", "#ff9c41", "#cc99cc"],
    css: `:root{
  --bg:#050507;
  --txt:#f2efe9;
  --txt-dim:#b9afc7;
  --txt-muted:#372f4a;
  --hot:#ff4136;

  --bdr:rgba(153,153,255,.10);
  --bhi:rgba(153,153,255,.20);

  --r:20px; --rs:12px;

  --cpu:#9c9cff;
  --gpu:#ffcc66;
  --fan:#ff9c41;
  --ssd:#cc99cc;
  --ram:#f0a8a8;
  --net:#66ccff;
  --accent:#FFCC99;

  --w1:#5ce0a0;
  --w2:#ffcc66;
  --w3:#ff9c41;
  --w4:#ff6b4a;
  --w5:#ff4136;

  --meter:rgba(156,156,255,.55);
  --dot-off-warn:rgba(242,239,233,.15);
  --dot-off-meter:rgba(242,239,233,.10);
  --spark-grid:rgba(204,153,204,.08);
  --spark-vtick:rgba(204,153,204,.05);

  --font-ui:"Antonio",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },
};

// Vars set by the last applyTheme(), removed before the next one so a
// theme's extras (e.g. Misty Metal's --bg-card) can't leak into the next.
let _lastThemeVars = [];

function applyTheme(key, customCSS = null) {
  const css = customCSS ?? THEMES[key]?.css ?? THEMES["deep-space"].css;
  const root = document.documentElement;

  _lastThemeVars.forEach((v) => root.style.removeProperty(v));
  _lastThemeVars = [];

  const matches = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)];
  for (const [, name, val] of matches) {
    const n = name.trim();
    root.style.setProperty(n, val.trim());
    _lastThemeVars.push(n);
  }

  // Mirror into the <style> tag for devtools.
  document.getElementById("theme-vars").textContent = css;
  cfg.theme = key;
  if (customCSS) cfg.customThemeCSS = customCSS;
  saveCfg();
  requestAnimationFrame(() => {
    if (phase === "dashboard") {
      buildCards();
      renderDashboard(liveDevices);
    }
  });
}

// Size presets. There is one design (Large; its rem tokens live in
// monitor.css :root) and S/M/L only set the root font-size, so text, padding,
// radii, canvases and the window all scale together. At Large 1rem is 17.83px:
// labels 15.6px, values 19.5px, smallest text about 10.4px.
const L_ROOT_PX = 17.8286;
const SIZES = {
  s: { label: "S", scale: 0.72 },
  m: { label: "M", scale: 0.86 },
  l: { label: "L", scale: 1 },
};

function _rootPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

// Resolve a rem-valued CSS token (--dash-w, --canvas-w …) to whole px.
function remVarPx(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return Math.round(parseFloat(v) * _rootPx());
}

// Pixel sizes JS needs (window width, canvases), derived from the CSS tokens.
function sizeMetrics() {
  return {
    width: remVarPx("--dash-w"),
    drawerW: remVarPx("--drawer-w"),
    canvas: { w: remVarPx("--canvas-w"), h: remVarPx("--canvas-h") },
  };
}

function applySize(key, rebuild = true) {
  if (!SIZES[key]) key = "s";
  const root = document.documentElement;
  const px = SIZES[key].scale * L_ROOT_PX;
  root.style.fontSize = px.toFixed(4) + "px";
  root.style.setProperty("--k", (px / 16).toFixed(4));
  cfg.size = key;
  saveCfg();
  document
    .querySelectorAll(".size-btn[data-size]")
    .forEach((b) => b.classList.toggle("active", b.dataset.size === key));
  if (rebuild && phase === "dashboard") {
    buildCards();
    renderDashboard(liveDevices);
  }
}
