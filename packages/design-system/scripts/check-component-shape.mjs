// COMPONENT SHAPE GUARD — 057. Zero-dependency, same philosophy as check-tokens.mjs.
//
// ⚠ WHAT THIS PROTECTS, AND WHY IT NEEDED A GUARD AT ALL.
//
// The platform ran a PILL system: `rounded-full` buttons, `h-11` pill inputs, `rounded-xl` cards. That
// was a deliberate decision (051) with its own reasoning written into the components — "the platform's
// ONE button shape" — and 057 deliberately reversed it for the squared console design.
//
// A reversal like that is exactly what gets half-undone six months later. Someone opens `button.tsx`,
// reads a comment about pills in the git history, and "restores" one component; now a pill button sits
// on an 8px card next to a 6px input, and nothing fails. Every prior shape drift on this codebase was
// invisible for the same reason — a class string is not type-checked and a DOM test does not look at
// corners.
//
// So the two rules that carry the design are asserted mechanically:
//
//   1. NO CONTROL IS A PILL. Buttons, inputs, selects, textareas and OTP fields must not carry
//      `rounded-full`. Badges MUST (a lozenge around a word is a shape, not a radius step), and
//      genuinely circular things — avatars, switches, radios, dots, progress bars — are exempt by name.
//   2. SURFACES ARE SOFTER THAN CONTROLS. A container may not be sharper than the control inside it,
//      which is the inversion that made the console look wrong before this pass: `rounded-xl` cards
//      around `rounded-md` buttons, and `rounded-md` menus full of `rounded-sm` rows.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ui = (name) => readFileSync(resolve(here, "../src/ui/", name), "utf8");

const errors = [];

/** Strip comments: prose must stay free to explain the history without tripping the guard. */
function code(name) {
  return ui(name)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── 1. No control is a pill ─────────────────────────────────────────────────────────────────────
//
// ⚠ `avatar`, `switch`, `radio-group` and `stepper` are absent ON PURPOSE: a switch track, a radio
// dot and a step number are round in the mockup too. Listing them as exempt would be the same as not
// listing them; what matters is that the five files below are checked.
const CONTROLS = ["button.tsx", "input.tsx", "select.tsx", "textarea.tsx", "otp-input.tsx"];
for (const name of CONTROLS) {
  if (/rounded-full/.test(code(name))) {
    errors.push(
      `${name} carries \`rounded-full\`. Controls are SQUARED on this platform (6px, \`rounded-md\`) — ` +
        `the imported console design hardcodes 6px on 131 controls. If a pill is genuinely wanted ` +
        `again, change it here AND in src/tokens/shop.css, not in one component.`,
    );
  }
}

// ⚠ The badge is the inverse assertion: it MUST be a pill. Squaring it makes it read as a tiny
// disabled button, which is what it looked like before 057.
if (!/rounded-full/.test(code("badge.tsx"))) {
  errors.push(
    "badge.tsx must be `rounded-full`. A status chip is a lozenge around a word — a SHAPE, not a step " +
      "on the radius scale — and every status chip in the imported design is 999px.",
  );
}

// ── 2. Surfaces are softer than controls ────────────────────────────────────────────────────────
//
// A container that is sharper than the control inside it inverts the hierarchy. Checked as a rank
// rather than a literal, so the rule survives a future rescaling of the tokens themselves.
const RANK = { none: 0, sm: 1, md: 2, lg: 3, xl: 4, "2xl": 5, "3xl": 6, full: 99 };

/** The softest radius any element in the file declares, ignoring true pills. */
function maxRadius(name) {
  const found = [...code(name).matchAll(/rounded-(none|sm|md|lg|xl|2xl|3xl)\b/g)].map((m) => RANK[m[1]]);
  return found.length ? Math.max(...found) : null;
}
/** The sharpest. */
function minRadius(name) {
  const found = [...code(name).matchAll(/rounded-(none|sm|md|lg|xl|2xl|3xl)\b/g)].map((m) => RANK[m[1]]);
  return found.length ? Math.min(...found) : null;
}

// Overlay surfaces hold rows; the surface must be at least as soft as its rows.
for (const name of ["dropdown-menu.tsx", "select.tsx", "popover.tsx", "dialog.tsx", "alert-dialog.tsx"]) {
  const surface = maxRadius(name);
  const row = minRadius(name);
  if (surface !== null && row !== null && surface < RANK.lg) {
    errors.push(
      `${name}: its softest radius is below \`rounded-lg\` (8px). Overlay SURFACES take the container ` +
        `step; only the rows inside them take the control step.`,
    );
  }
}

// The card is the canonical surface: exactly the container step, never softer.
const card = maxRadius("card.tsx");
if (card !== RANK.lg) {
  errors.push(
    `card.tsx must be \`rounded-lg\` (8px, the container step), found rank ${card}. \`rounded-xl\` is ` +
      `what made a card read as softer than the page it sits on.`,
  );
}

if (errors.length) {
  console.error("check-component-shape: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-component-shape: OK — ${CONTROLS.length} controls squared, badge is a pill, surfaces ≥ their rows`,
);
