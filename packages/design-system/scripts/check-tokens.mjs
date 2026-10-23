// Token guard for src/tokens.css (Node stdlib only), run as `tokens:test`. It asserts:
//  1. every colour var exists in both:root (light) and.dark;
//  2. the radius scale, which web and mobile EffyRadius share;
//  3. WCAG 2.1 AA on every text pair in both appearances, and the UI thresholds for fills and the ring.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// A list of one on purpose: a future per-surface token layer adds an entry and inherits every rule.
const TARGETS = [{ label: "tokens.css", path: "../src/tokens.css" }];

const errors = [];
for (const target of TARGETS) checkFile(target);

if (errors.length) {
  console.error("check-tokens: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-tokens: OK — ${TARGETS.length} token files \u00d7 2 appearances, all pairs pass WCAG AA`,
);

function checkFile({ label, path }) {
// Comments are stripped before parsing: prose naming a selector would otherwise be matched as the block.
const css = readFileSync(resolve(here, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const err = (m) => errors.push(`[${label}] ${m}`);

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

// 0) The residue after stripping comments must still be CSS. A `*/` inside a comment (e.g. a glob like
// `--chart-` + `*/`) closes it early and turns the rest into stylesheet source, which every parser here
// would miss and only a production build would catch. Outside comments the file is only at-rules,
// selectors, braces and declarations; statements are scanned, since a declaration may wrap.
{
  let buf = "";
  let depth = 0;
  const check = (raw, kind) => {
    const body = raw.replace(/\s+/g, " ").trim();
    if (!body) return;
    const ok =
      /^@/.test(body) || // at-rule (@font-face, @theme inline, @keyframes, @media, @custom-variant)
      (kind === "decl" && /^[\w-]+\s*:\s*.+$/.test(body)) || // declaration, incl. --custom-property
      (kind === "block" && /^[\w.:[\]()&*>+~#="'\-\s,%]+$/.test(body)); // selector / keyframe offset
    if (ok) return;
    err(
      `not CSS after comment-stripping — a comment almost certainly closed early (an asterisk ` +
        `followed by a slash inside one): "${body.slice(0, 70)}"`,
    );
  };
  for (const ch of css) {
    if (ch === "{") {
      check(buf, "block");
      buf = "";
      depth++;
    } else if (ch === "}") {
      check(buf, "decl");
      buf = "";
      depth--;
      if (depth < 0) {
        err("unbalanced braces after comment-stripping (a closing brace with no opener)");
        break;
      }
    } else if (ch === ";") {
      check(buf, "decl");
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (depth !== 0) err(`unbalanced braces after comment-stripping (depth ${depth})`);
  if (buf.trim()) check(buf, "decl");
}

const light = parseBlock(":root");
const dark = parseBlock(".dark");

// 1) The same key set in both appearances.
for (const k of Object.keys(light)) if (!(k in dark)) err(`--${k} missing from .dark`);
for (const k of Object.keys(dark)) if (!(k in light)) err(`--${k} missing from :root`);

// 2) Radius parity with mobile EffyRadius (px at a 16px root).
const remPx = (name) => {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
  return m ? Math.round(parseFloat(m[1]) * 16) : null;
};
// The four-step scale: 4px checkboxes, 6px controls, 8px buttons and icon chips, 10px containers.
const RADII = { "--radius-sm": 4, "--radius-md": 6, "--radius-lg": 8, "--radius-xl": 10 };
for (const [step, px] of Object.entries(RADII)) {
  if (remPx(step) !== px) err(`${step} must be ${px}px, got ${remPx(step)}px`);
}
if (remPx("--radius") !== 10) err(`--radius must be 0.625rem (10px, the container step), got ${remPx("--radius")}px`);

// 3) WCAG 2.1 contrast.
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

// [foreground, background, minimum]. Text pairs (including labels on fills) hold 4.5:1. UI pairs hold
// 3:1 (WCAG 1.4.11): disabled controls (exempt in WCAG, held anyway), placeholders. Borders are not
// tested: a 3:1 border would be a slab on every surface.
const TEXT = 4.5;
const UI = 3;
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
  // The focus ring is a non-text UI component: 3:1.
  ["ring", "background", UI],
  ["disabled-foreground", "disabled", UI],
  ["placeholder", "background", UI],

  // Every tinted surface against the solid written on it: a `-soft` ground is where a palette fails
  // while looking harmonious.
  ["brand", "background", TEXT], // link, eyebrow label, "label →" ghost link
  ["brand-ink", "brand-soft", TEXT], // active nav item, in-progress status pill
  ["primary-foreground", "brand", TEXT], // the label on a primary button
  ["accent2", "background", TEXT], // unread count, cut-off chip, the notification dot itself
  ["accent2", "accent2-soft", TEXT],
  ["violet", "violet-soft", TEXT], // avatar tint 2
  ["teal", "teal-soft", TEXT], // avatar tint 3
  ["destructive", "destructive-soft", TEXT], // failed / refunded pill
  ["warning", "warning-soft", TEXT], // awaiting / at-risk pill
  ["warning", "background", TEXT],
  // Success clears 4.5:1 as text on white and on its tint, but still gets no -foreground pair (below).
  ["success", "success-soft", TEXT],
  ["success", "background", TEXT],
];

// Success is never a fill with a label on it: it has no `--success-foreground`, so there is nothing to put
// text on it with.
const SEMANTIC_NON_TEXT = ["success", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

// The data-visualisation palette is for charts only: present in both appearances, and never given a
// -foreground pair (SEMANTIC_NON_TEXT), so it cannot become a UI accent.
const CHART_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];
for (const name of CHART_TOKENS) {
  if (!(name in light)) err(`--${name} missing from :root (chart palette must exist in both appearances)`);
  if (!(name in dark)) err(`--${name} missing from .dark (chart palette must exist in both appearances)`);
}

for (const [appName, set] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min] of PAIRS) {
    if (!(fg in set) || !(bg in set)) {
      err(`[${appName}] pair --${fg}/--${bg}: a var is missing`);
      continue;
    }
    const r = ratio(set[fg], set[bg]);
    if (r < min) {
      err(`[${appName}] --${fg} on --${bg} = ${r.toFixed(2)}:1 (needs ${min}:1)`);
    }
  }
}

// 3b) Every ratio written in a comment must match the recomputed one: hand-maintained figures rot when a
// value moves. Two forms: "N:1 on --token" / "N:1 on the ground", and a bare "N:1" on a *-foreground
// declaration, meaning on the surface it is the foreground of.
{
  const SOLO = {
    foreground: "background",
    "card-foreground": "card",
    "popover-foreground": "popover",
    "accent-foreground": "accent",
    "secondary-foreground": "secondary",
    "primary-foreground": "primary",
    "sidebar-foreground": "sidebar",
    "disabled-foreground": "disabled",
  };
  for (const [appName, selector, set] of [
    ["light", ":root", light],
    ["dark", ".dark", dark],
  ]) {
    const block = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m"));
    if (!block) continue;
    // The original text: the annotations live in the comments.
    const raw = readFileSync(resolve(here, path), "utf8");
    const rb = raw.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
    if (!rb) continue;
    for (const line of rb[1].split("\n")) {
      const decl = line.match(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6});\s*\/\*(.*?)\*\//);
      if (!decl) continue;
      const [, name, value, note] = decl;
      const claims = [];
      for (const m of note.matchAll(/([\d.]+):1 on (?:the ground|--([\w-]+))/g)) {
        claims.push([m[1], m[2] ?? "background"]);
      }
      const solo = note.match(/^\s*([\d.]+):1\s*$/);
      if (solo && SOLO[name]) claims.push([solo[1], SOLO[name]]);
      for (const [claimed, bgName] of claims) {
        const bg = set[bgName];
        if (!bg) {
          err(`[${appName}] --${name} cites --${bgName}, which is not declared`);
          continue;
        }
        const actual = ratio(value.toLowerCase(), bg).toFixed(2);
        if (actual !== claimed) {
          err(
            `[${appName}] --${name} comment claims ${claimed}:1 on --${bgName}, actual ${actual}:1 ` +
              `— fix the comment, not the check`,
          );
        }
      }
    }
  }
}

// 4) The monospace stack must stay monospace: codes are dictated, read back and compared digit by
// digit, and proportional digits make 1/l, 0/O and 5/S ambiguous. Nothing else would fail.
const MONO_HINTS = ["mono", "consol", "menlo", "courier", "sfmono"];
const monoDecl = css.match(/--font-mono\s*:\s*([^;]+);/);
if (monoDecl) {
  const value = monoDecl[1].toLowerCase();
  if (!MONO_HINTS.some((hint) => value.includes(hint))) {
    err(
      `--font-mono is declared as "${monoDecl[1].trim()}", which does not look monospace. ` +
        `OtpInput's cell variant sets each character position in tabular monospace so a code that ` +
        `is read aloud, dictated or compared against an email is unambiguous (1/l, 0/O, 5/S). ` +
        `Keep --font-mono monospace (packages/design-system/src/ui/otp-input.tsx).`,
    );
  }
}

// 5) Non-text semantic colours must not acquire a foreground pair (SEMANTIC_NON_TEXT).
for (const name of SEMANTIC_NON_TEXT) {
  if (`${name}-foreground` in light || `${name}-foreground` in dark) {
    err(
      `--${name}-foreground exists: --${name} is a NON-TEXT indicator only (constitution v1.11.0). ` +
        `If text must sit on it, re-tune --${name} to clear 4.5:1 first and add the pair to PAIRS.`,
    );
  }
}

}
