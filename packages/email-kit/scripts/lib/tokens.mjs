// Email tokens, derived from packages/design-system/src/tokens.css by role. Nothing is authored here,
// so a palette change reaches email with no edit. Node stdlib only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const TOKENS_CSS = resolve(here, "../../../design-system/src/tokens.css");

/** Parse a `:root { … }` / `.dark { … }` block into { name: "#rrggbb" }. */
function parseBlock(css, selector) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const body = css.match(re);
  if (!body) throw new Error(`email tokens: no '${selector}' block in tokens.css`);
  const out = {};
  for (const line of body[1].split("\n")) {
    const m = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/**
 * Email role → (light token, dark token). Three choices serve dark-mode survival: the page ground is
 * not pure white (it would invert to pure black), the authored dark ground is not pure black, and the
 * code surface avoids the mid-tone band (MIDTONE_BAND) in dark.
 */
const ROLE_MAP = {
  pageGround: { light: "accent", dark: "sidebar" },
  canvas: { light: "background", dark: "background" },
  ink: { light: "foreground", dark: "foreground" },
  mutedInk: { light: "muted-foreground", dark: "muted-foreground" },
  hairline: { light: "border", dark: "border" },
  actionFill: { light: "primary", dark: "primary" },
  actionLabel: { light: "primary-foreground", dark: "primary-foreground" },
  codeSurface: { light: "accent", dark: "secondary" },
  error: { light: "destructive", dark: "destructive" },
  success: { light: "success", dark: "success" },
};

/**
 * The banned mid-tone band: #707070–#909090 barely moves under inversion and is where partial inversion
 * is unpredictable. Muted text goes darker and dividers lighter.
 */
export const MIDTONE_BAND = { lo: 0x70, hi: 0x90 };

/** Roles where a mid-tone value would be load-bearing (text and rules). Fills are exempt. */
const MIDTONE_GUARDED = ["ink", "mutedInk", "hairline", "actionLabel"];

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** WCAG 2.1 relative luminance. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, rounded to 2dp. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/**
 * Per-channel inversion (`255 - v`): what a client that forces its own dark mode shows. Equal to
 * HSL-lightness inversion for greys; hues shift, which is why no colour is the sole carrier of meaning.
 */
export function invert(hex) {
  return rgbToHex(hexToRgb(hex).map((v) => 255 - v));
}

/**
 * Text/surface pairs that must clear WCAG aa in all three passes (4.5 for text, 3.0 for an indicator).
 * `success` has no foreground pair: nothing is written on it.
 */
export const CONTRAST_PAIRS = [
  { fg: "ink", bg: "canvas", min: 4.5, what: "body text on the canvas" },
  { fg: "ink", bg: "pageGround", min: 4.5, what: "text on the page ground" },
  { fg: "ink", bg: "codeSurface", min: 4.5, what: "the code, on its surface" },
  { fg: "mutedInk", bg: "canvas", min: 4.5, what: "muted text on the canvas" },
  { fg: "mutedInk", bg: "pageGround", min: 4.5, what: "muted text on the page ground" },
  { fg: "mutedInk", bg: "codeSurface", min: 4.5, what: "muted text on the code surface" },
  { fg: "actionLabel", bg: "actionFill", min: 4.5, what: "the button label on its fill" },
  { fg: "error", bg: "canvas", min: 4.5, what: "error text on the canvas" },
  { fg: "success", bg: "canvas", min: 3.0, what: "the success indicator (NON-TEXT) on the canvas" },
];

/** Build the email token set from tokens.css. Throws with every problem, never just the first. */
export function buildEmailTokens() {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const light = parseBlock(css, ":root");
  const dark = parseBlock(css, ".dark");

  const errors = [];
  const tokens = { light: {}, dark: {} };

  for (const [role, src] of Object.entries(ROLE_MAP)) {
    for (const mode of ["light", "dark"]) {
      const table = mode === "light" ? light : dark;
      const value = table[src[mode]];
      if (!value) {
        errors.push(`role '${role}' (${mode}) reads --${src[mode]}, which tokens.css does not define`);
        continue;
      }
      tokens[mode][role] = value;
    }
  }

  // The radius scale, rem at a 16px root.
  const remPx = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
    return m ? Math.round(parseFloat(m[1]) * 16) : null;
  };
  // Email takes the button step (--radius-lg). The exported key keeps the name `radiusSm` so the
  // generated artifacts are unchanged.
  const radiusButton = remPx("--radius-lg");
  if (radiusButton !== 8)
    errors.push(`--radius-lg must be 0.5rem (8px, the button step), got ${radiusButton}px`);
  tokens.radiusSm = `${radiusButton}px`;

  if (errors.length) {
    throw new Error("email tokens could not be derived:\n  - " + errors.join("\n  - "));
  }
  return tokens;
}

/** Every rule the derived token set must satisfy. Returns a list of human-readable failures. */
export function validateEmailTokens(tokens) {
  const errors = [];

  // The page ground must not be pure white.
  if (tokens.light.pageGround === "#ffffff") {
    errors.push("light pageGround is #ffffff — it inverts to exactly #000000; use the ramp's 50 step");
  }
  // The authored dark ground must never be pure black.
  for (const role of ["pageGround", "canvas"]) {
    if (tokens.dark[role] === "#000000") {
      errors.push(`dark ${role} is #000000 — target #1A1A1A or #0A0A0A instead`);
    }
  }

  // The mid-tone band, on load-bearing roles only.
  for (const mode of ["light", "dark"]) {
    for (const role of MIDTONE_GUARDED) {
      const [r, g, b] = hexToRgb(tokens[mode][role]);
      const inBand = [r, g, b].every((v) => v >= MIDTONE_BAND.lo && v <= MIDTONE_BAND.hi);
      if (inBand) {
        errors.push(
          `${mode} ${role} = ${tokens[mode][role]} sits in the banned mid-tone band ` +
            `#707070–#909090 — the fixed point of lightness inversion and the ambiguity zone of ` +
            `partial inversion`,
        );
      }
    }
  }

  // Contrast, three passes. Pass 3 is the algorithmically inverted light palette.
  const inverted = Object.fromEntries(
    Object.entries(tokens.light).map(([k, v]) => [k, invert(v)]),
  );
  const passes = [
    { name: "light", set: tokens.light },
    { name: "dark (authored restatement)", set: tokens.dark },
    { name: "light, FORCE-INVERTED by a client", set: inverted },
  ];

  for (const pass of passes) {
    for (const pair of CONTRAST_PAIRS) {
      const fg = pass.set[pair.fg];
      const bg = pass.set[pair.bg];
      const ratio = contrast(fg, bg);
      if (ratio < pair.min) {
        errors.push(
          `[${pass.name}] ${pair.what}: ${pair.fg} ${fg} on ${pair.bg} ${bg} = ${ratio}:1, ` +
            `below the ${pair.min}:1 bar`,
        );
      }
    }
  }

  return errors;
}

/** The type scale: email-specific sizes, not in tokens.css. */
export const TYPE = {
  // Not delivered by @font-face: no web font ships.
  stack:
    "'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  // Weights 400/500/600 only; 700 would synthesise a faux bold.
  wordmark: { size: 22, line: 28, weight: 600, letterSpacing: "-0.01em" },
  h1: { size: 24, line: 32, weight: 600, letterSpacing: "-0.01em" },
  body: { size: 16, line: 24, weight: 400, letterSpacing: null },
  code: { size: 36, line: 44, weight: 500, letterSpacing: "0.15em" },
  small: { size: 14, line: 21, weight: 400, letterSpacing: null },
  footer: { size: 14, line: 21, weight: 400, letterSpacing: null },
  button: { size: 16, line: 20, weight: 600, letterSpacing: null },
};

/** Layout constants. */
export const LAYOUT = {
  width: "600px",
  gutter: "32px",
  gutterMobile: "24px",
};
