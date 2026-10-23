// Guard for the storefront identity (src/storefront/tokens.css), a second identity with its own rules:
//  1. the key set is exactly the storefront's;
//  2. one `:root` block (the website) and one `.dark` block (the mobile app) with the same keys, and no
//  data-theme selector or colour-scheme query, so the web cannot switch to dark;
//  3. every colour is a grey, the blue or the green;
//  4. --destructive is the foreground;
//  5. --brand is not --primary (green is never the action colour);
//  6. WCAG aa on every text pair, and every ratio written in a comment is real.
// Part of `pnpm --filter @effy/design-system test`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../src/storefront/tokens.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const fail = [];

if (/data-theme|prefers-color-scheme/.test(css)) {
  fail.push("the WEBSITE is light only — found a data-theme selector or a colour-scheme query in the storefront file");
}
if ((css.match(/\.dark\s*\{/g) ?? []).length > 1) fail.push("more than one .dark block — one palette, one block");

const rootBody = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
if (!rootBody) {
  console.error("check-storefront-tokens: FAILED — no :root block");
  process.exit(1);
}
const vars = {};
for (const m of rootBody.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim().toLowerCase();

const EXPECTED = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "primary-muted",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground",
  "destructive", "destructive-foreground", "border", "input", "ring",
  "brand", "brand-foreground", "brand-muted", "scrim", "radius",
];
for (const k of EXPECTED) if (!(k in vars)) fail.push(`missing --${k}`);
for (const k of Object.keys(vars)) if (!EXPECTED.includes(k)) fail.push(`unexpected --${k} (not a storefront token)`);

// The mobile app's dark appearance: the same colour keys (no --radius).
const darkBody = css.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1];
const darkVars = {};
if (darkBody) {
  for (const m of darkBody.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) darkVars[m[1]] = m[2].trim().toLowerCase();
  for (const k of EXPECTED.filter((k) => k !== "radius")) if (!(k in darkVars)) fail.push(`.dark: missing --${k}`);
  for (const k of Object.keys(darkVars)) if (!EXPECTED.includes(k) || k === "radius") fail.push(`.dark: unexpected --${k}`);
}

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
  // A grey when the channels sit within 6 of each other (zinc is faintly cool); else the blue (b dominant) or green (g dominant) family.
  for (const [k, v] of Object.entries(vars)) {
    if (!/^#[0-9a-f]{6}$/.test(v)) continue;
    const [r, g, b] = rgb(v);
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 6) continue;
    if (r > g && r > b) fail.push(`${label}--${k}: ${v} is red-dominant — there is no red on the storefront`);
    const blue = b > r && b >= g;
    const green = g > r && g > b;
    if (!blue && !green) fail.push(`${label}--${k}: ${v} is neither a grey, the blue nor the green`);
  }

  if (vars.destructive !== vars.foreground) fail.push(label + "--destructive must equal --foreground (no red)");
  if (vars.brand === vars.primary) fail.push(label + "--brand must NOT equal --primary on the storefront (green is never an action)");
  if (vars.ring !== vars.primary) fail.push(label + "--ring must equal --primary");

  // [text, ground, minimum]
  const PAIRS = [
    ["foreground", "background", 4.5],
    ["foreground", "muted", 4.5],
    ["muted-foreground", "background", 4.5],
    ["muted-foreground", "muted", 4.5],
    ["primary", "background", 4.5],
    ["primary", "primary-muted", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["brand", "background", 4.5],
    ["brand", "brand-muted", 4.5],
    ["brand-foreground", "brand", 4.5],
    ["secondary-foreground", "secondary", 4.5],
    ["accent-foreground", "accent", 4.5],
    ["destructive-foreground", "destructive", 4.5],
    ["ring", "background", 3],
  ];
  for (const [fg, bg, min] of PAIRS) {
    if (!vars[fg] || !vars[bg]) continue;
    const r = ratio(vars[fg], vars[bg]);
    if (r < min) fail.push(`${label}--${fg} on --${bg} is ${r.toFixed(2)}:1, below ${min}:1`);
  }

}
checkAppearance(vars, "")
if (darkBody) checkAppearance(darkVars, ".dark: ")

// Every ratio written beside a value must be the real one.
for (const m of raw.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6});\s*\/\*([^*]*)\*\//g)) {
  const [, name, hex, note] = m;
  for (const c of note.matchAll(/([\d.]+):1 on (white|--[\w-]+)/g)) {
    const ground = c[2] === "white" ? "#ffffff" : vars[c[2].slice(2)];
    if (!ground) continue;
    const real = ratio(hex.toLowerCase(), ground);
    if (Math.abs(real - Number(c[1])) > 0.015) {
      fail.push(`--${name}: comment says ${c[1]}:1 on ${c[2]}, recomputed ${real.toFixed(2)}:1`);
    }
  }
}

if (fail.length) {
  console.error("check-storefront-tokens: FAILED\n" + fail.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log(`check-storefront-tokens: OK — ${EXPECTED.length} tokens, light${darkBody ? " + mobile dark" : ""}, five values, every text pair at AA in each`);
