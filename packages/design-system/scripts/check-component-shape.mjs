// Component shape guard. A class string is not type-checked, so the design's two shape rules are
// asserted here:
//  1. No control is a pill: buttons, inputs, selects, textareas and OTP fields never carry
//  `rounded-full`. Badges must; genuinely circular things (avatars, switches, radios, dots,
//  progress) are not checked.
//  2. Surfaces are softer than controls: a container is never sharper than what it holds.

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

// 1. No control is a pill
const CONTROLS = ["button.tsx", "input.tsx", "select.tsx", "textarea.tsx", "otp-input.tsx"];
for (const name of CONTROLS) {
  if (/rounded-full/.test(code(name))) {
    errors.push(
      `${name} carries \`rounded-full\`. Controls are SQUARED on this platform (6px, \`rounded-md\`; ` +
        `buttons 8px, \`rounded-lg\`) — the adopted console design hardcodes 6px on 131 controls. If a ` +
        `pill is genuinely wanted again, change the RADIUS SCALE in src/tokens.css, not one component.`,
    );
  }
}

// The badge must be a pill: squared, it reads as a tiny disabled button.
if (!/rounded-full/.test(code("badge.tsx"))) {
  errors.push(
    "badge.tsx must be `rounded-full`. A status chip is a lozenge around a word — a SHAPE, not a step " +
      "on the radius scale — and every status chip in the imported design is 999px.",
  );
}

// 2. Surfaces are softer than controls, checked as a rank so it survives a rescale.
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

// The scale is sm 4 / md 6 / lg 8 / xl 10: controls 6px, buttons and icon chips 8px, containers 10px.
const CONTAINER = RANK.xl;

// Overlay surfaces hold rows; the surface must be at least as soft as its rows.
for (const name of ["dropdown-menu.tsx", "select.tsx", "popover.tsx", "dialog.tsx", "alert-dialog.tsx"]) {
  const surface = maxRadius(name);
  const row = minRadius(name);
  if (surface !== null && row !== null && surface < CONTAINER) {
    errors.push(
      `${name}: its softest radius is below \`rounded-xl\` (10px). Overlay SURFACES take the container ` +
        `step; only the rows inside them take the control step.`,
    );
  }
}

// The card is the canonical surface: exactly the container step, never softer and never sharper.
const card = maxRadius("card.tsx");
if (card !== CONTAINER) {
  errors.push(
    `card.tsx must be \`rounded-xl\` (10px, the container step), found rank ${card}. A card at the ` +
      `BUTTON step reads as softer than the page and flatter than the control inside it.`,
  );
}

// The button sits between them: at `rounded-md` it would match the inputs and lose the step between a field and an action.
const button = maxRadius("button.tsx");
if (button !== RANK.lg) {
  errors.push(
    `button.tsx must be \`rounded-lg\` (8px, the button step), found rank ${button}. Buttons sit one ` +
      `step above controls (6px) and one below containers (10px).`,
  );
}

if (errors.length) {
  console.error("check-component-shape: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-component-shape: OK — ${CONTROLS.length} controls squared, badge is a pill, surfaces ≥ their rows`,
);
