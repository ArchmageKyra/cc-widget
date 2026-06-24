/* ════════════════════════════════════════════════════════════════════════════
   Theia monitor — themes.js
   ────────────────────────────────────────────────────────────────────────────
   THEMES catalogue + applyTheme().
   To add a theme: append an entry to THEMES following the existing pattern.
   Use the in-app Theme Builder → "Generate CSS" to produce the css string.

   Every theme MUST provide at minimum:
     --bg  --txt  --txt-dim  --txt-muted  --hot
     --bdr  --bhi
     --r  --rs
     --cpu  --gpu  --fan  --ssd  --ram  --net
     --w1…--w5
     --meter  --dot-off-warn  --dot-off-meter  --spark-grid  --spark-vtick
     --font-ui  --font-num  --font-code
   ════════════════════════════════════════════════════════════════════════════ */
"use strict";

const THEMES = {
  /* ── 1. Deep Space ─────────────────────────────────────────────────────
       The default. Clean technical dark — blue-black void, crisp accents.
       Every other theme is judged against this one for legibility.           */
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

  /* ── 2. Catppuccin Mocha ───────────────────────────────────────────────
       Faithful to the official Catppuccin palette. Cozy, pastel, readable.
       Rounded corners reinforce the soft personality.                        */
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

  --font-ui:"Inter",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── 3. Nord ───────────────────────────────────────────────────────────
       Arctic Scandinavia. Cool desaturated blues, no warm tones.
       Everything feels like ice, pine, and overcast sky.                     */
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

  --font-ui:"Inter",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── 4. Gruvbox Dark ───────────────────────────────────────────────────
       Warm terminal earth tones. Feels like a well-used workstation in
       a cave. Rajdhani gives the labels a slight military-stencil edge.      */
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

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── 5. Wandering Waters ───────────────────────────────────────────────
       Dawn light on a dark river. Organic, unhurried.
       Space Grotesk for UI gives it warmth without going precious.           */
  "wandering-waters": {
    name: "Wandering Waters",
    swatches: ["#10171B", "#D4845B", "#7FCF87", "#68B6E8", "#F1E2BE"],
    css: `:root{
  --bg:#10171B;
  --txt:#ECE5D8;
  --txt-dim:#8FA8AD;
  --txt-muted:#2E4048;
  --hot:#A95349;

  --bdr:rgba(117,162,178,.09);
  --bhi:rgba(117,162,178,.18);

  --r:12px; --rs:7px;

  --cpu:#D4845B;
  --gpu:#7FCF87;
  --fan:#F1E2BE;
  --ssd:#68B6E8;
  --ram:#46C7C8;
  --net:#D8B06D;

  --w1:#7FCF87;
  --w2:#C6D56B;
  --w3:#F0C25A;
  --w4:#E68A58;
  --w5:#C9544B;

  --meter:rgba(212,132,91,.42);
  --dot-off-warn:rgba(104,182,232,.13);
  --dot-off-meter:rgba(104,182,232,.08);
  --spark-grid:rgba(104,182,232,.07);
  --spark-vtick:rgba(104,182,232,.04);

  --font-ui:"Space Grotesk",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── 6. Nixie Nocturne ─────────────────────────────────────────────────
       Vintage vacuum-tube display in a dark machine room.
       VT323 for numerics is NON-NEGOTIABLE — it IS the theme.
       Rajdhani for UI reads like embossed metal type.                        */
  "nixie-nocturne": {
    name: "Nixie Nocturne",
    swatches: ["#1A1719", "#D66A4A", "#E0B64F", "#F2E4C8", "#8D4038"],
    css: `:root{
  --bg:#1A1719;
  --txt:#F2E4C8;
  --txt-dim:#A08E78;
  --txt-muted:#3D342B;
  --hot:#B6463B;

  --bdr:rgba(242,228,200,.08);
  --bhi:rgba(242,228,200,.16);

  --r:10px; --rs:6px;

  --cpu:#D66A4A;
  --gpu:#E0B64F;
  --fan:#C65C43;
  --ssd:#D6C39A;
  --ram:#F2E4C8;
  --net:#C98652;

  --w1:#D6C39A;
  --w2:#E0B64F;
  --w3:#E89A4A;
  --w4:#D66A4A;
  --w5:#B6463B;

  --meter:rgba(214,106,74,.38);
  --dot-off-warn:rgba(224,182,79,.14);
  --dot-off-meter:rgba(224,182,79,.09);
  --spark-grid:rgba(242,228,200,.07);
  --spark-vtick:rgba(242,228,200,.04);

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"VT323",ui-monospace,monospace;
  --font-code:"IBM Plex Mono",ui-monospace,monospace;
}`,
  },

  /* ── 7. Reclaimer Relay ────────────────────────────────────────────────
       UNSC clean-room tech. Cool blues and warm amber status lights
       against a near-black hull. Orbitron is the Halo font.                 */
  "reclaimer-relay": {
    name: "Reclaimer Relay",
    swatches: ["#0B1017", "#63C8FF", "#70F1E6", "#8DAE83", "#FFD08A"],
    css: `:root{
  --bg:#0B1017;
  --txt:#DCEAF7;
  --txt-dim:#7A9BB8;
  --txt-muted:#253549;
  --hot:#F45A5A;

  --bdr:rgba(99,200,255,.09);
  --bhi:rgba(99,200,255,.18);

  --r:5px; --rs:3px;

  --cpu:#63C8FF;
  --gpu:#70F1E6;
  --fan:#8DAE83;
  --ssd:#F6A64B;
  --ram:#FFD08A;
  --net:#A9C8BC;

  --w1:#8DAE83;
  --w2:#BFD38A;
  --w3:#F2D063;
  --w4:#F6A64B;
  --w5:#F45A5A;

  --meter:rgba(99,200,255,.42);
  --dot-off-warn:rgba(99,200,255,.13);
  --dot-off-meter:rgba(99,200,255,.08);
  --spark-grid:rgba(112,241,230,.06);
  --spark-vtick:rgba(112,241,230,.03);

  --font-ui:"Orbitron",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"Share Tech Mono",ui-monospace,monospace;
}`,
  },

  /* ── 8. Sangheili Signal ───────────────────────────────────────────────
       Covenant plasma tech. Bioluminescent purples and alien greens.
       Warn ramp goes violet → magenta → acid → cyan → hot — deliberately
       non-temperature to feel alien. Severity still escalates left→right.    */
  "sangheili-signal": {
    name: "Sangheili Signal",
    swatches: ["#0C0914", "#AE7CFF", "#F47DFF", "#4AA9F8", "#A4E85C"],
    css: `:root{
  --bg:#0C0914;
  --txt:#EAD9FF;
  --txt-dim:#8A72AA;
  --txt-muted:#2A1F3E;
  --hot:#FF5D82;

  --bdr:rgba(174,124,255,.09);
  --bhi:rgba(174,124,255,.18);

  --r:8px; --rs:5px;

  --cpu:#AE7CFF;
  --gpu:#F47DFF;
  --fan:#4AA9F8;
  --ssd:#A4E85C;
  --ram:#D5F39C;
  --net:#54D7F2;

  --w1:#AE7CFF;
  --w2:#F47DFF;
  --w3:#A4E85C;
  --w4:#54D7F2;
  --w5:#FF5D82;

  --meter:rgba(174,124,255,.42);
  --dot-off-warn:rgba(174,124,255,.13);
  --dot-off-meter:rgba(174,124,255,.08);
  --spark-grid:rgba(84,215,242,.06);
  --spark-vtick:rgba(84,215,242,.03);

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"Space Mono",ui-monospace,monospace;
  --font-code:"Space Mono",ui-monospace,monospace;
}`,
  },

  /* ── 9. Tokyo Twilight ─────────────────────────────────────────────────
       Neon noir. Rain-slicked streets, glowing kanji, vending machine glow.
       Rajdhani for UI reads like sharp signage. Space Mono for nums
       has the right matrix-terminal energy.                                  */
  "tokyo-twilight": {
    name: "Tokyo Twilight",
    swatches: ["#0A1022", "#FF5EA8", "#8A7CFF", "#49E0FF", "#FFD3BF"],
    css: `:root{
  --bg:#0A1022;
  --txt:#F8DDF0;
  --txt-dim:#8A7AA0;
  --txt-muted:#261E38;
  --hot:#FF4968;

  --bdr:rgba(255,94,168,.09);
  --bhi:rgba(255,94,168,.18);

  --r:10px; --rs:6px;

  --cpu:#FF5EA8;
  --gpu:#8A7CFF;
  --fan:#49E0FF;
  --ssd:#FF8B6B;
  --ram:#FFD3BF;
  --net:#6AC8FF;

  --w1:#49E0FF;
  --w2:#8A7CFF;
  --w3:#C98BFF;
  --w4:#FF5EA8;
  --w5:#FF4968;

  --meter:rgba(138,124,255,.44);
  --dot-off-warn:rgba(255,94,168,.12);
  --dot-off-meter:rgba(255,94,168,.07);
  --spark-grid:rgba(73,224,255,.06);
  --spark-vtick:rgba(73,224,255,.03);

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"Space Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── 10. Misty Metal ───────────────────────────────────────────────────
       Brushed aluminum. Desaturated and precise, Apple-adjacent industrial.
       Full surface overrides because this theme's neutrals need exact tuning.
       SF Pro / SF Mono feel native on macOS; fall through to system stack
       gracefully on Linux.                                                   */
  "misty-metal": {
    name: "Misty Metal",
    swatches: ["#1E222A", "#A9C7FF", "#7FD6C2", "#D2A679", "#E57373"],
    css: `:root{
  --bg:#1E222A;
  --txt:#E6EAF2;
  --txt-dim:#8A95A8;
  --txt-muted:#3A404C;
  --hot:#E57373;

  --bg-bar:rgba(255,255,255,.04);
  --bg-overlay:rgba(255,255,255,.03);
  --bg-card:rgba(255,255,255,.04);
  --bg-card-hdr:rgba(255,255,255,.03);
  --bg-input:rgba(255,255,255,.05);
  --bg-canvas:rgba(0,0,0,.20);
  --bg-code:rgba(255,255,255,.06);
  --bg-hover:rgba(255,255,255,.06);
  --bg-hover-subtle:rgba(255,255,255,.03);
  --bg-active:rgba(255,255,255,.08);
  --bg-sel:rgba(111,168,255,.12);
  --bg-danger:rgba(229,115,115,.14);
  --bg-err:rgba(229,115,115,.09);
  --track-bg:rgba(255,255,255,.07);

  --bdr:rgba(255,255,255,.08);
  --bhi:rgba(255,255,255,.14);
  --bdr-accent:rgba(169,199,255,.28);
  --bdr-err:rgba(229,115,115,.22);

  --r:10px; --rs:6px;

  --cpu:#A9C7FF;
  --gpu:#7FD6C2;
  --fan:#D2A679;
  --ssd:#A7B0FF;
  --ram:#C4CEDE;
  --net:#7CCFD0;

  --w1:#6FD98C;
  --w2:#B9D96F;
  --w3:#E6C46A;
  --w4:#E69A5C;
  --w5:#E57373;

  --meter:rgba(196,206,222,.42);
  --dot-off-warn:rgba(196,206,222,.12);
  --dot-off-meter:rgba(196,206,222,.07);
  --spark-grid:rgba(255,255,255,.06);
  --spark-vtick:rgba(255,255,255,.04);

  --font-ui:"SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --font-num:"SF Mono","IBM Plex Mono",ui-monospace,monospace;
  --font-code:"SF Mono","IBM Plex Mono",ui-monospace,monospace;
}`,
  },
};

function applyTheme(key, customCSS = null) {
  const css = customCSS ?? THEMES[key]?.css ?? THEMES["deep-space"].css;
  const root = document.documentElement;
  const matches = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)];
  for (const [, name, val] of matches) {
    root.style.setProperty(name.trim(), val.trim());
  }
  // Keep the <style> tag in sync for devtools / copy
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
