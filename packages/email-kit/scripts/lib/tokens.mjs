import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const TOKENS_CSS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../design-system/src/tokens.css");

const ROLES = {
  pageGround: { light: "accent", dark: "sidebar" },
  canvas: { light: "background", dark: "background" },
  ink: { light: "foreground", dark: "foreground" },
  mutedInk: { light: "muted-foreground", dark: "muted-foreground" },
  hairline: { light: "border", dark: "border" },
  actionFill: { light: "primary-fill", dark: "primary-fill" },
  actionLabel: { light: "primary-foreground", dark: "primary-foreground" },
  codeSurface: { light: "accent", dark: "secondary" },
};

const MIDTONE_GUARDED = ["ink", "mutedInk", "hairline", "actionLabel"];

const CONTRAST_PAIRS = [
  ["ink", "canvas"],
  ["ink", "pageGround"],
  ["ink", "codeSurface"],
  ["mutedInk", "canvas"],
  ["mutedInk", "pageGround"],
  ["mutedInk", "codeSurface"],
  ["actionLabel", "actionFill"],
];

const MIN_CONTRAST = 4.5;

export const TYPE = {
  stack: "'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  wordmark: { size: 22, line: 28, weight: 600, letterSpacing: "-0.01em" },
  h1: { size: 24, line: 32, weight: 600, letterSpacing: "-0.01em" },
  body: { size: 16, line: 24, weight: 400 },
  code: { size: 36, line: 44, weight: 500, letterSpacing: "0.15em" },
  small: { size: 14, line: 21, weight: 400 },
  button: { size: 16, line: 20, weight: 600 },
};

function parseBlock(css, selector) {
  const block = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`email tokens: no '${selector}' block in tokens.css`);
  return Object.fromEntries(
    [...block[1].matchAll(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const invert = (hex) => "#" + channels(hex).map((v) => (255 - v).toString(16).padStart(2, "0")).join("");

function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function problems(tokens) {
  const errors = [];
  if (tokens.light.pageGround === "#ffffff") errors.push("light pageGround is #ffffff - it inverts to pure black");
  for (const role of ["pageGround", "canvas"]) {
    if (tokens.dark[role] === "#000000") errors.push(`dark ${role} is #000000 - use a near-black instead`);
  }
  for (const mode of ["light", "dark"]) {
    for (const role of MIDTONE_GUARDED) {
      const value = tokens[mode][role];
      if (channels(value).every((v) => v >= 0x70 && v <= 0x90)) {
        errors.push(`${mode} ${role} = ${value} is in the mid-tone band #707070–#909090, which inversion barely moves`);
      }
    }
  }
  const passes = {
    light: tokens.light,
    dark: tokens.dark,
    "force-inverted light": Object.fromEntries(Object.entries(tokens.light).map(([k, v]) => [k, invert(v)])),
  };
  for (const [pass, set] of Object.entries(passes)) {
    for (const [fg, bg] of CONTRAST_PAIRS) {
      const ratio = contrast(set[fg], set[bg]);
      if (ratio < MIN_CONTRAST) {
        errors.push(`[${pass}] ${fg} ${set[fg]} on ${bg} ${set[bg]} = ${ratio}:1, below ${MIN_CONTRAST}:1`);
      }
    }
  }
  return errors;
}

export function loadEmailTokens() {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const source = { light: parseBlock(css, ":root"), dark: parseBlock(css, ".dark") };
  const errors = [];
  const tokens = { light: {}, dark: {} };

  for (const [role, names] of Object.entries(ROLES)) {
    for (const mode of ["light", "dark"]) {
      const value = source[mode][names[mode]];
      if (value) tokens[mode][role] = value;
      else errors.push(`role '${role}' (${mode}) reads --${names[mode]}, which tokens.css does not define`);
    }
  }

  const radius = css.match(/--radius-lg\s*:\s*([\d.]+)rem/);
  if (radius) tokens.radiusButton = `${Math.round(parseFloat(radius[1]) * 16)}px`;
  else errors.push("--radius-lg is not defined in rem in tokens.css");

  if (!errors.length) errors.push(...problems(tokens));
  if (errors.length) throw new Error("email tokens are invalid:\n  - " + errors.join("\n  - "));
  return tokens;
}
