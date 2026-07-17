// TOKEN GUARD — zero-dependency, runs in CI as `tokens:test` (017 SC-003 / research R8).
//
// This package intentionally has NO test framework (its generator is proudly zero-dep); this guard
// follows the same philosophy — Node stdlib only — so "is the brand legible?" is a build failure, not a
// Lighthouse score three months later. It asserts, against src/tokens.css:
//   1. every color var exists in BOTH :root (light) and .dark,
//   2. --radius-sm = 0.5rem (8px) and --radius-md = 1rem (16px)  — web == mobile EffyRadius (SC-004),
//   3. every foreground/surface text pair meets WCAG 2.1 AA (>= 4.5:1) in both appearances, and the
//      accent/destructive fills + the focus ring clear their thresholds.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../src/tokens.css"), "utf8");

/** Parse a `:root { … }` / `.dark { … }` block into { name: "#rrggbb" }. */
function parseBlock(selector) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`check-tokens: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const light = parseBlock(":root");
const dark = parseBlock(".dark");
const errors = [];

// 1) same key set in both appearances
for (const k of Object.keys(light)) if (!(k in dark)) errors.push(`--${k} missing from .dark`);
for (const k of Object.keys(dark)) if (!(k in light)) errors.push(`--${k} missing from :root`);

// 2) radius parity with mobile EffyRadius (px at 16px root)
const remPx = (name) => {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
  return m ? Math.round(parseFloat(m[1]) * 16) : null;
};
if (remPx("--radius-sm") !== 8) errors.push(`--radius-sm must be 0.5rem (8px), got ${remPx("--radius-sm")}px`);
if (remPx("--radius-md") !== 16) errors.push(`--radius-md must be 1rem (16px), got ${remPx("--radius-md")}px`);

// 3) WCAG 2.1 contrast
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground var, background var, minRatio]. All text pairs (incl. button/badge/nav LABELS on a
// fill) hold to WCAG AA normal-text 4.5:1 — the emerald-800 accent clears it, so no lenient
// exception is needed. The focus ring is a non-text UI indicator (WCAG 1.4.11 → 3:1); it also
// clears 4.5 here, so we hold it to the same bar for simplicity.
const TEXT = 4.5;
const PAIRS = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["sidebar-foreground", "sidebar", TEXT],
  ["sidebar-primary-foreground", "sidebar-primary", TEXT],
  ["sidebar-accent-foreground", "sidebar-accent", TEXT],
  ["ring", "background", TEXT],
];

for (const [appName, set] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min] of PAIRS) {
    if (!(fg in set) || !(bg in set)) {
      errors.push(`[${appName}] pair --${fg}/--${bg}: a var is missing`);
      continue;
    }
    const r = ratio(set[fg], set[bg]);
    if (r < min) {
      errors.push(`[${appName}] --${fg} on --${bg} = ${r.toFixed(2)}:1 (needs ${min}:1)`);
    }
  }
}

if (errors.length) {
  console.error("check-tokens: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(`check-tokens: OK — ${Object.keys(light).length} vars × 2 appearances, radii 8/16, all pairs pass WCAG AA`);
