import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ui = (name) => readFileSync(resolve(here, "../src/ui/", name), "utf8");

const errors = [];

function code(name) {
  return ui(name)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SQUARED = ["button.tsx", "input.tsx", "select.tsx", "textarea.tsx", "otp-input.tsx", "badge.tsx"];
for (const name of SQUARED) {
  if (/rounded-full/.test(code(name))) {
    errors.push(`${name} carries \`rounded-full\`. Controls and status tags are never pills.`);
  }
}

const RANK = { none: 0, sm: 1, md: 2, lg: 3, xl: 4, "2xl": 5, "3xl": 6 };
const radii = (name) => [...code(name).matchAll(/rounded-(none|sm|md|lg|xl|2xl|3xl)\b/g)].map((m) => RANK[m[1]]);
const maxRadius = (name) => (radii(name).length ? Math.max(...radii(name)) : null);
const minRadius = (name) => (radii(name).length ? Math.min(...radii(name)) : null);

// Controls are `rounded-lg` (8px); a status tag sits one step under them (`rounded-md`, 6px).
for (const name of ["button.tsx", "input.tsx", "select.tsx", "textarea.tsx"]) {
  const r = maxRadius(name);
  if (r !== RANK.lg) errors.push(`${name} must be \`rounded-lg\` (8px, the control step), found rank ${r}.`);
}
if (maxRadius("badge.tsx") !== RANK.md) {
  errors.push(`badge.tsx must be \`rounded-md\` (6px, the tag step), found rank ${maxRadius("badge.tsx")}.`);
}
if (maxRadius("card.tsx") !== RANK.xl) {
  errors.push(`card.tsx must be \`rounded-xl\` (12px, the container step), found rank ${maxRadius("card.tsx")}.`);
}
for (const name of ["dropdown-menu.tsx", "select.tsx", "dialog.tsx", "alert-dialog.tsx"]) {
  const surface = maxRadius(name);
  const row = minRadius(name);
  if (surface !== null && row !== null && surface < row) {
    errors.push(`${name}: an overlay surface is sharper than a row inside it.`);
  }
}

// The toast (120) is drawn by its own stylesheet, not by Tailwind classes: a floating surface at the overlay corner,
// its buttons at the control corner, never pills.
{
  const css = readFileSync(resolve(here, "../src/toast.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };
  if (!/border-radius:\s*var\(--radius-xl/.test(rule(".ef-toast-surface"))) {
    errors.push("toast.css: .ef-toast-surface must take the overlay corner (var(--radius-xl)), as dialogs do.");
  }
  const buttons = rule(".ef-toast-button,\n.ef-toast-close");
  if (!/border-radius:\s*var\(--radius-lg/.test(buttons)) {
    errors.push("toast.css: the toast's buttons must take the control corner (var(--radius-lg)).");
  }
  if (/9999px|50%/.test(buttons)) errors.push("toast.css: the toast's buttons are never pills.");
}

if (errors.length) {
  console.error("check-component-shape: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-component-shape: OK - ${SQUARED.length} controls and tags never pills, controls at 8px, card at 12px, surfaces ≥ their rows, the toast's surface and buttons`,
);
