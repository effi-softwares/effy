// Component shape guard. A class string is not type-checked, so the consoles' shape rules are asserted
// here:
//  1. Nothing that holds words is a pill: buttons, inputs, selects, textareas, OTP fields and badges
//  never carry `rounded-full` (genuinely circular things — avatars, switches, radios, dots — are not
//  checked).
//  2. Buttons and badges share the control step (6px, `rounded-md`); the card is the container step
//  (8px, `rounded-lg`); an overlay surface is never sharper than the rows it holds.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ui = (name) => readFileSync(resolve(here, "../src/ui/", name), "utf8");

const errors = [];

/** Strips comments, so prose cannot trip the guard. */
function code(name) {
  return ui(name)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// 1. Nothing that holds words is a pill
const SQUARED = ["button.tsx", "input.tsx", "select.tsx", "textarea.tsx", "otp-input.tsx", "badge.tsx"];
for (const name of SQUARED) {
  if (/rounded-full/.test(code(name))) {
    errors.push(`${name} carries \`rounded-full\`. Controls and status tags are squared (6px, \`rounded-md\`).`);
  }
}

// 2. One control step, one container step, checked as a rank so it survives a rescale.
const RANK = { none: 0, sm: 1, md: 2, lg: 3, xl: 4, "2xl": 5, "3xl": 6 };
const radii = (name) => [...code(name).matchAll(/rounded-(none|sm|md|lg|xl|2xl|3xl)\b/g)].map((m) => RANK[m[1]]);
const maxRadius = (name) => (radii(name).length ? Math.max(...radii(name)) : null);
const minRadius = (name) => (radii(name).length ? Math.min(...radii(name)) : null);

for (const name of ["button.tsx", "badge.tsx", "input.tsx", "select.tsx", "textarea.tsx"]) {
  const r = maxRadius(name);
  if (r !== RANK.md) errors.push(`${name} must be \`rounded-md\` (6px, the control step), found rank ${r}.`);
}
if (maxRadius("card.tsx") !== RANK.lg) {
  errors.push(`card.tsx must be \`rounded-lg\` (8px, the container step), found rank ${maxRadius("card.tsx")}.`);
}
for (const name of ["dropdown-menu.tsx", "select.tsx", "dialog.tsx", "alert-dialog.tsx"]) {
  const surface = maxRadius(name);
  const row = minRadius(name);
  if (surface !== null && row !== null && surface < row) {
    errors.push(`${name}: an overlay surface is sharper than a row inside it.`);
  }
}

if (errors.length) {
  console.error("check-component-shape: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-component-shape: OK — ${SQUARED.length} controls and tags squared at the control step, card at the container step, surfaces ≥ their rows`,
);
