// EMAIL TOKENS — derived from packages/design-system/src/tokens.css, the brand SSOT
// (constitution Principle V; specs/038-email-template-system/contracts/email-tokens.contract.md).
//
// ⚠ NOTHING HERE IS AUTHORED. Every value is looked up in tokens.css by role. A hand-written email
// colour is a build failure, which is what makes SC-020 true: a change to the platform palette
// reaches email with no edit.
//
// Zero dependencies by design — Node stdlib only, exactly like design-system/scripts/check-tokens.mjs
// and packages/brand's generator. The generator must never become load-bearing in a build graph.

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
 * The role map — email role → (light source token, dark source token).
 *
 * ⚠ THREE ROLES DEVIATE from the obvious design-system pick, and each deviation is a dark-mode
 * survival requirement rather than a taste call (contract §1):
 *
 *  1. `pageGround` is ramp-50 (#F5F5F5), NOT --background (#FFFFFF). Pure white inverts to EXACTLY
 *     #000000 — the one dark surface every designer avoids (halation on OLED, maximum eye strain
 *     against high-contrast text).
 *  2. `pageGround`'s dark value is --sidebar (#0A0A0A) and `canvas`'s is --background (#1A1A1A), so
 *     the authored dark ground is never pure black.
 *  3. `codeSurface` takes --accent on light but --secondary on dark: --accent's dark value (#4D4D4D)
 *     sits inside the banned mid-tone band (see MIDTONE_BAND).
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
 * ⚠ THE BANNED MID-TONE BAND (research R13).
 *
 * #707070–#909090 is the FIXED POINT of lightness inversion (#808080 maps to #7F7F7F — it does not
 * move) and the ambiguity zone of PARTIAL inversion, where a client may or may not decide a value is
 * "a light thing". A load-bearing colour there is unpredictable in exactly the clients that are
 * hardest to test. Push muted text darker and dividers lighter.
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
 * ⚠ Per-channel inversion — `255 - v`.
 *
 * This models what a client that ignores our restatement and forces its own dark mode actually
 * shows. It is a VALID model here for one specific reason: for a colour with saturation 0,
 * HSL-lightness inversion and naive per-channel inversion produce EXACTLY THE SAME VALUE. The Effy
 * ramp is achromatic, so it has no hue to shift. The two semantic colours DO shift (error → cyan,
 * success → pink), which is precisely why neither may ever be the sole carrier of meaning (FR-028).
 */
export function invert(hex) {
  return rgbToHex(hexToRgb(hex).map((v) => 255 - v));
}

/**
 * Text/surface pairs that must clear WCAG AA, checked in all three passes.
 * `min` is 4.5 for text and 3.0 for a non-text indicator.
 *
 * ⚠ `success` has NO foreground pair, deliberately and in both appearances: it clears 3:1 as an
 * indicator and fails 4.5:1 as text, so nothing may ever be written on it. design-system's
 * check-tokens.mjs fails the build if a --success-foreground appears; this inherits that rule.
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

  // The radius scale, pinned in tokens.css as rem at a 16px root.
  const remPx = (name) => {
    const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
    return m ? Math.round(parseFloat(m[1]) * 16) : null;
  };
  const radiusSm = remPx("--radius-sm");
  if (radiusSm !== 6) errors.push(`--radius-sm must be 0.375rem (6px), got ${radiusSm}px`);
  tokens.radiusSm = `${radiusSm}px`;

  if (errors.length) {
    throw new Error("email tokens could not be derived:\n  - " + errors.join("\n  - "));
  }
  return tokens;
}

/** Every rule the derived token set must satisfy. Returns a list of human-readable failures. */
export function validateEmailTokens(tokens) {
  const errors = [];

  // ⚠ Deviation 1 — the page ground must not be pure white (it would invert to pure black).
  if (tokens.light.pageGround === "#ffffff") {
    errors.push("light pageGround is #ffffff — it inverts to exactly #000000; use the ramp's 50 step");
  }
  // ⚠ Deviation 2 — the authored dark ground must never be pure black.
  for (const role of ["pageGround", "canvas"]) {
    if (tokens.dark[role] === "#000000") {
      errors.push(`dark ${role} is #000000 — target #1A1A1A or #0A0A0A instead`);
    }
  }

  // ⚠ Deviation 3 — the banned mid-tone band, on load-bearing roles only.
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

/** The type scale. Sizes are email-specific and live here, not in tokens.css (contract §2). */
export const TYPE = {
  // ⚠ General Sans is NOT delivered by @font-face — see FONT_STACK_NOTE in gen-email.mjs.
  stack:
    "'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  // ⚠ Weights 400/500/600 ONLY. The design language never uses 700; it would synthesise a faux bold.
  wordmark: { size: 22, line: 28, weight: 600, letterSpacing: "-0.01em" },
  h1: { size: 24, line: 32, weight: 600, letterSpacing: "-0.01em" },
  body: { size: 16, line: 24, weight: 400, letterSpacing: null },
  code: { size: 36, line: 44, weight: 500, letterSpacing: "0.15em" },
  small: { size: 14, line: 21, weight: 400, letterSpacing: null },
  footer: { size: 14, line: 21, weight: 400, letterSpacing: null },
  button: { size: 16, line: 20, weight: 600, letterSpacing: null },
};

/** Layout constants (contract §1, spec § D4). */
export const LAYOUT = {
  width: "600px",
  gutter: "32px",
  gutterMobile: "24px",
};
