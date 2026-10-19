// GUARD — the back-office identity (src/backoffice/tokens.css; the "Effy Back-Office Redesign" canvas).
//
// The back-office wears the storefront/driver identity but still renders the console's shared
// primitives and kit, so its file is held to BOTH:
//
//   1. every --color-* the console file declares, this file declares too — a console name the
//      back-office renders through a shared primitive must resolve, or Tailwind emits no rule;
//   2. :root and .dark carry the same colour keys;
//   3. five values: every colour is a grey, the blue or the green. No red, no orange;
//   4. --destructive and --warning ARE the foreground (a problem is black with an icon);
//   5. --primary = --brand = --ring (one action colour; the console name keeps its console meaning);
//   6. WCAG AA on every text pair in each appearance, and every ratio written in a comment is real.
//
// Run: node scripts/check-backoffice-tokens.mjs (part of `pnpm --filter @effy/design-system test`).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../src/backoffice/tokens.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const consoleCss = readFileSync(resolve(here, "../src/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];

// The FIRST :root and .dark blocks are the colour blocks; the later ones carry shape and motion.
function block(selector) {
  const body = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
  if (!body) {
    console.error(`check-backoffice-tokens: FAILED — no ${selector} block`);
    process.exit(1);
  }
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim().toLowerCase();
  return vars;
}
const light = block(":root");
const dark = block("\\.dark");

// 1 — the console vocabulary resolves here.
const declared = (src) => new Set([...src.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]));
const ours = declared(css);
for (const name of declared(consoleCss)) {
  if (!ours.has(name)) fail.push(`@theme declares no --color-${name}, which the console file (and so a shared primitive) uses`);
}
for (const name of ours) {
  if (!(name in light)) fail.push(`--color-${name} points at --${name}, which :root does not declare`);
}

// 2 — one key set per appearance.
for (const k of Object.keys(light)) if (!(k in dark)) fail.push(`.dark: missing --${k}`);
for (const k of Object.keys(dark)) if (!(k in light) && k !== "color-scheme") fail.push(`:root: missing --${k}`);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function checkAppearance(vars, label) {
  // 3 — a grey when the channels sit within 6 of each other; else the blue or the green family.
  for (const [k, v] of Object.entries(vars)) {
    if (!/^#[0-9a-f]{6}$/.test(v)) continue;
    const [r, g, b] = rgb(v);
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 6) continue;
    if (r > g && r > b) fail.push(`${label}--${k}: ${v} is red-dominant — there is no red or orange in the back-office`);
    const blue = b > r && b >= g;
    const green = g > r && g > b;
    if (!blue && !green) fail.push(`${label}--${k}: ${v} is neither a grey, the blue nor the green`);
  }

  // 4, 5
  if (vars.destructive !== vars.foreground) fail.push(label + "--destructive must equal --foreground");
  if (vars.warning !== vars.foreground) fail.push(label + "--warning must equal --foreground");
  if (vars.brand !== vars.primary) fail.push(label + "--brand must equal --primary (the console's action-colour name)");
  if (vars.ring !== vars.primary) fail.push(label + "--ring must equal --primary");

  // 6 — [text, ground, minimum]
  const PAIRS = [
    ["foreground", "background", 4.5],
    ["foreground", "card", 4.5],
    ["foreground", "muted", 4.5],
    ["muted-foreground", "background", 4.5],
    ["muted-foreground", "muted", 4.5],
    ["popover-foreground", "popover", 4.5],
    ["primary", "background", 4.5],
    ["primary", "primary-muted", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["brand-ink", "brand-soft", 4.5],
    ["accent2", "accent2-soft", 4.5],
    ["success", "background", 4.5],
    ["success", "success-soft", 4.5],
    ["warning", "warning-soft", 4.5],
    ["destructive", "destructive-soft", 4.5],
    ["destructive-foreground", "destructive", 4.5],
    ["secondary-foreground", "secondary", 4.5],
    ["accent-foreground", "accent", 4.5],
    ["sidebar-foreground", "sidebar", 4.5],
    ["sidebar-muted", "sidebar", 4.5],
    ["sidebar-accent-foreground", "sidebar-accent", 4.5],
    ["foreground", "row-selected", 4.5],
    ["ring", "background", 3], // WCAG 1.4.11 — a focus ring nobody can see is not one
  ];
  for (const [fg, bg, min] of PAIRS) {
    if (!vars[fg] || !vars[bg]) {
      fail.push(`${label}pair --${fg} / --${bg} names a token that is not declared`);
      continue;
    }
    const r = ratio(vars[fg], vars[bg]);
    if (r < min) fail.push(`${label}--${fg} on --${bg} is ${r.toFixed(2)}:1, below ${min}:1`);
  }
}
checkAppearance(light, "");
checkAppearance(dark, ".dark: ");

// Every ratio written beside a value must be the real one.
for (const [selector, vars] of [[":root", light], ["\\.dark", dark]]) {
  const body = raw.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6});\s*\/\*([^*]*)\*\//g)) {
    const [, name, hex, note] = m;
    for (const c of note.matchAll(/([\d.]+):1 on (white|#[0-9a-fA-F]{6}|--[\w-]+)/g)) {
      const ground = c[2] === "white" ? "#ffffff" : c[2].startsWith("#") ? c[2].toLowerCase() : vars[c[2].slice(2)];
      if (!ground) continue;
      const real = ratio(hex.toLowerCase(), ground);
      if (Math.abs(real - Number(c[1])) > 0.015) {
        fail.push(`--${name}: comment says ${c[1]}:1 on ${c[2]}, recomputed ${real.toFixed(2)}:1`);
      }
    }
  }
}

if (fail.length) {
  console.error("check-backoffice-tokens: FAILED\n" + fail.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log(
  `check-backoffice-tokens: OK — ${Object.keys(light).length} tokens, light + dark, the console vocabulary, five values, every text pair at AA`,
);
