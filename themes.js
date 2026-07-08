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
  /* ── Deep Space ─────────────────────────────────────────────────────
       The default. Clean technical dark — blue-black void, crisp accents.
       Every other theme is judged against this one for legibility.
       LCARS-adjacent: the coral --hot + periwinkle --ram pairing carries the
       reference; Titillium Web (ESA heritage) keeps it calm, not costumey.   */
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

  --font-ui:"Titillium Web",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --font-num:"Share Tech Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
}`,
  },

  /* ── Catppuccin Mocha ───────────────────────────────────────────────
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

  /* ── Nord ───────────────────────────────────────────────────────────
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

  /* ── Gruvbox Dark ───────────────────────────────────────────────────
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

  /* ── Solarized Dark ───────────────────────────────────────────────
     Academic, low-contrast precision. Calm, deliberate readability.
     Nothing shouts; everything is measured.                          */
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

    --font-ui:"Inter",system-ui,sans-serif;
    --font-num:"IBM Plex Mono",ui-monospace,monospace;
    --font-code:"IBM Plex Mono",ui-monospace,monospace;
  }`,
  },
  /* ── Dracula ───────────────────────────────────────────────────────
     Neon night syntax. High contrast, high clarity, no ambiguity.
     Feels like code glowing in a dark room.                          */
  dracula: {
    name: "Dracula",
    swatches: ["#282a36", "#bd93f9", "#50fa7b", "#ffb86c", "#8be9fd"],
    css: `:root{
    --bg:#282a36;
    --txt:#f8f8f2;
    --txt-dim:#b6b6c1;
    --txt-muted:#44475a;
    --hot:#ff5555;

    --bdr:rgba(248,248,242,.09);
    --bhi:rgba(248,248,242,.18);

    --r:8px; --rs:5px;

    --cpu:#bd93f9;
    --gpu:#50fa7b;
    --fan:#ffb86c;
    --ssd:#8be9fd;
    --ram:#f8f8f2;
    --net:#ff79c6;

    --w1:#50fa7b;
    --w2:#8be9fd;
    --w3:#bd93f9;
    --w4:#ffb86c;
    --w5:#ff5555;

    --meter:rgba(189,147,249,.55);
    --dot-off-warn:rgba(248,248,242,.12);
    --dot-off-meter:rgba(248,248,242,.08);
    --spark-grid:rgba(248,248,242,.06);
    --spark-vtick:rgba(248,248,242,.03);

    --font-ui:"Inter",system-ui,sans-serif;
    --font-num:"IBM Plex Mono",ui-monospace,monospace;
    --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
  }`,
  },
  /* ── Tokyo Night ───────────────────────────────────────────────────
       The actual, widely-ported Tokyo Night palette (terminal/editor/GTK),
       not a generic neon-noir pastiche — this is what makes it useful for
       matching a desktop that already runs it. Blue/green/orange-led, which
       also clears the purple/magenta overlap it used to share with
       Sangheili Signal. Inter keeps it calm and editor-like, not signage.    */
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
  /* ── Rosé Pine ─────────────────────────────────────────────────────
     Replaces Bold Blueprint, which was too close to Reclaimer Relay's cool-
     blue/sharp-corner register without its own identity. Rosé Pine is a
     real, widely-ported desktop/terminal/editor palette — soft, muted rose,
     gold, pine and iris — that gives the set a genuinely different mood
     (elegant, quiet) instead of another technical/sci-fi entry.       */
  "rose-pine": {
    name: "Rosé Pine",
    swatches: ["#191724", "#eb6f92", "#f6c177", "#9ccfd8", "#c4a7e7"],
    css: `:root{
    --bg:#191724;
    --txt:#e0def4;
    --txt-dim:#908caa;
    --txt-muted:#403d52;
    --hot:#eb6f92;

    --bdr:rgba(224,222,244,.08);
    --bhi:rgba(224,222,244,.16);

    --r:9px; --rs:5px;

    --cpu:#9ccfd8;
    --gpu:#c4a7e7;
    --fan:#f6c177;
    --ssd:#ebbcba;
    --ram:#e0def4;
    --net:#31748f;

    --w1:#9ccfd8;
    --w2:#f6c177;
    --w3:#ebbcba;
    --w4:#eb6f92;
    --w5:#b4637a;

    --meter:rgba(156,207,216,.45);
    --dot-off-warn:rgba(224,222,244,.13);
    --dot-off-meter:rgba(224,222,244,.08);
    --spark-grid:rgba(224,222,244,.06);
    --spark-vtick:rgba(224,222,244,.03);

    --font-ui:"Inter",system-ui,sans-serif;
    --font-num:"IBM Plex Mono",ui-monospace,monospace;
    --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
  }`,
  },
  /* ── Wandering Waters ───────────────────────────────────────────────
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

  --meter:rgba(212,132,91,.48);
  --dot-off-warn:rgba(104,182,232,.13);
  --dot-off-meter:rgba(104,182,232,.08);
  --spark-grid:rgba(104,182,232,.07);
  --spark-vtick:rgba(104,182,232,.04);

  --font-ui:"Space Grotesk",system-ui,sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,monospace;
  --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
  }`,
  },
  /* ── Nixie Nocturne ───────────────────────────────────────────────────
       Nixie Nocturne, merged with Atomic Amber's reactor intensity.
       VT323 for numerics is still NON-NEGOTIABLE — it IS the theme.
       Rajdhani for UI reads like embossed metal type. The amber/red is
       brighter and the meter runs hotter than base Nixie — it never
       fully dims — while the vacuum-tube warmth stays intact.                */
  "nixie-nocturne": {
    name: "Nixie Nocturne",
    swatches: ["#191316", "#FF9A2E", "#E0B64F", "#F2E4C8", "#C4302B"],
    css: `:root{
  --bg:#191316;
  --txt:#F2E4C8;
  --txt-dim:#B39A72;
  --txt-muted:#40342A;
  --hot:#FF3B30;

  --bdr:rgba(255,176,0,.10);
  --bhi:rgba(255,176,0,.20);

  --r:7px; --rs:4px;

  --cpu:#FF9A2E;
  --gpu:#E0B64F;
  --fan:#D66A4A;
  --ssd:#D6C39A;
  --ram:#F2E4C8;
  --net:#E89A4A;

  --w1:#D6C39A;
  --w2:#E0B64F;
  --w3:#FF9A2E;
  --w4:#E85A2A;
  --w5:#FF3B30;

  --meter:rgba(255,154,46,.52);
  --dot-off-warn:rgba(224,182,79,.15);
  --dot-off-meter:rgba(224,182,79,.10);
  --spark-grid:rgba(242,228,200,.07);
  --spark-vtick:rgba(242,228,200,.04);

  --font-ui:"Rajdhani",system-ui,sans-serif;
  --font-num:"VT323",ui-monospace,monospace;
  --font-code:"IBM Plex Mono",ui-monospace,monospace;
}`,
  },
  /* ── Monochrome Matrix ─────────────────────────────────────────────
     Monochrome phosphor display. Single-channel intensity logic — severity
     is read through brightness, not hue, so the warn ramp climbs from a dim
     idle green up to a near-white overdriven phosphor. --hot is the only
     color allowed to break green, which is what keeps this a terminal
     instrument rather than a wall of identical green.                 */
  "mono-matrix": {
    name: "Monochrome Matrix",
    swatches: ["#050805", "#00ff66", "#00cc55", "#009944", "#66ff99"],
    css: `:root{
    --bg:#050805;
    --txt:#b6ffcc;
    --txt-dim:#5bbf7a;
    --txt-muted:#1a3322;
    --hot:#ff3b3b;

    --bdr:rgba(0,255,102,.10);
    --bhi:rgba(0,255,102,.20);

    --r:2px; --rs:1px;

    --cpu:#00ff66;
    --gpu:#66ff99;
    --fan:#00cc55;
    --ssd:#99ffcc;
    --ram:#33ff88;
    --net:#00dd77;

    --w1:#1c7a44;
    --w2:#00cc55;
    --w3:#00ff66;
    --w4:#7dffb3;
    --w5:#e8fff0;

    --meter:rgba(0,255,102,.40);
    --dot-off-warn:rgba(0,255,102,.10);
    --dot-off-meter:rgba(0,255,102,.06);
    --spark-grid:rgba(0,255,102,.05);
    --spark-vtick:rgba(0,255,102,.03);

    --font-ui:"VT323",monospace;
    --font-num:"VT323",monospace;
    --font-code:"IBM Plex Mono",ui-monospace,monospace;
  }`,
  },
  /* ── Misty Metal ───────────────────────────────────────────────────
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

  --r:12px; --rs:7px;

  --cpu:#A9C7FF;
  --gpu:#7FD6C2;
  --fan:#D2A679;
  --ssd:#C3A6FF;
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
  /* ── Reclaimer Relay ────────────────────────────────────────────────
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

  /* ── Sangheili Signal ───────────────────────────────────────────────
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

  --r:14px; --rs:8px;

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
  /* ── Radiant ───────────────────────────────────────────────────────
     Midnight Malachite, retuned — the malachite-and-gold DNA was already
     doing ancient-temple-at-night, so this leans into it fully as the
     light-side half of a Radiant/Dire pair. Emerald, antique gold, warm
     ember-red escalation. Pairs with Dire (below); same font stack for
     both, so the only contrast between the two is chromatic — like the
     two sides of the same UI shell reskinned.                        */
  radiant: {
    name: "Midnight Malachite",
    swatches: ["#071510", "#34D399", "#D4AF37", "#F0E4B8", "#FF6B5C"],
    css: `:root{
    --bg:#071510;
    --txt:#EAF2E8;
    --txt-dim:#9DB39A;
    --txt-muted:#1E2E22;
    --hot:#FF6B5C;

    --bdr:rgba(52,211,153,.10);
    --bhi:rgba(52,211,153,.20);

    --r:10px; --rs:6px;

    --cpu:#34D399;
    --gpu:#86EFAC;
    --fan:#D4AF37;
    --ssd:#7FD8A8;
    --ram:#F0E4B8;
    --net:#4ADE80;

    --w1:#34D399;
    --w2:#A3E635;
    --w3:#D4AF37;
    --w4:#F59E0B;
    --w5:#FF6B5C;

    --meter:rgba(52,211,153,.48);
    --dot-off-warn:rgba(240,228,184,.12);
    --dot-off-meter:rgba(240,228,184,.08);
    --spark-grid:rgba(52,211,153,.06);
    --spark-vtick:rgba(52,211,153,.03);

    --font-ui:"Space Grotesk",system-ui,sans-serif;
    --font-num:"IBM Plex Mono",ui-monospace,monospace;
    --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
  }`,
  },
  /* ── 14. Dire ──────────────────────────────────────────────────────────
     Atomic Amber's reactor intensity got folded into Atomic Nixie above,
     which freed this slot — now the dark-side half of the Radiant pair.
     Red and black, volcanic/wasteland, sith-adjacent. Same font stack as
     Radiant on purpose: the contrast between the two factions is entirely
     chromatic. Warn ramp escalates crimson → ember-orange → blazing red,
     the same "break the palette's own rule for the top of the ramp" trick
     Atomic Nixie and Radiant both use.                               */
  "dire-dusk": {
    name: "Dire Dusk",
    swatches: ["#140708", "#E23B4E", "#8B2E3F", "#FF6A3D", "#E8A0A8"],
    css: `:root{
    --bg:#140708;
    --txt:#F2DCD9;
    --txt-dim:#A67A78;
    --txt-muted:#35181A;
    --hot:#FF3B3B;

    --bdr:rgba(226,59,78,.10);
    --bhi:rgba(226,59,78,.20);

    --r:10px; --rs:6px;

    --cpu:#E23B4E;
    --gpu:#8B2E3F;
    --fan:#FF6A3D;
    --ssd:#C25A6B;
    --ram:#E8A0A8;
    --net:#B34848;

    --w1:#7A3B3F;
    --w2:#B34848;
    --w3:#E23B4E;
    --w4:#FF6A3D;
    --w5:#FF3B3B;

    --meter:rgba(226,59,78,.50);
    --dot-off-warn:rgba(242,220,217,.13);
    --dot-off-meter:rgba(242,220,217,.08);
    --spark-grid:rgba(242,220,217,.06);
    --spark-vtick:rgba(242,220,217,.03);

    --font-ui:"Space Grotesk",system-ui,sans-serif;
    --font-num:"IBM Plex Mono",ui-monospace,monospace;
    --font-code:"JetBrains Mono","Fira Code",ui-monospace,monospace;
  }`,
  },
};

// Track which CSS custom properties were last set by applyTheme so we can
// cleanly remove them before applying the next theme (prevents cross-theme
// leakage — e.g. Misty Metal sets --bg-card/--bg-bar overrides that must not
// bleed into the next theme if it doesn't define them).
let _lastThemeVars = [];

function applyTheme(key, customCSS = null) {
  const css = customCSS ?? THEMES[key]?.css ?? THEMES["deep-space"].css;
  const root = document.documentElement;

  // Remove vars from the previous theme before applying the new one
  _lastThemeVars.forEach((v) => root.style.removeProperty(v));
  _lastThemeVars = [];

  const matches = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)];
  for (const [, name, val] of matches) {
    const n = name.trim();
    root.style.setProperty(n, val.trim());
    _lastThemeVars.push(n);
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
