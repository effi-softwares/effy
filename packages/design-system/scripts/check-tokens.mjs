// Token guard for src/tokens.css, the one theme every web and mobile app uses.
//  1. The file is still CSS once comments are stripped (a stray `*/` inside a comment closes it early).
//  2. Light and dark declare the same tokens, and every @theme colour points at a declared token.
//  3. Every colour is a Tailwind palette value (or white / black); no custom hexes.
//  4. No red or orange outside the promo palette: a problem is the foreground with an icon and words.
//  5. The radius scale is 4 / 6 / 8 / 12, the default 8, the sheet 16.
//  6. Every text pair is WCAG AA (4.5:1), every UI boundary 3:1, in both appearances.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../src/tokens.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const errors = [];
const err = (m) => errors.push(m);

{
  let buf = "";
  let depth = 0;
  const check = (text, kind) => {
    const body = text.replace(/\s+/g, " ").trim();
    if (!body) return;
    const ok =
      /^@/.test(body) ||
      (kind === "decl" && /^[\w-]+\s*:\s*.+$/.test(body)) ||
      (kind === "block" && /^[\w.:[\]()&*>+~#="'\-\s,%]+$/.test(body));
    if (!ok) err(`not CSS after comment-stripping (a comment closed early?): "${body.slice(0, 70)}"`);
  };
  for (const ch of css) {
    if (ch === "{") (check(buf, "block"), (buf = ""), depth++);
    else if (ch === "}") (check(buf, "decl"), (buf = ""), depth--);
    else if (ch === ";") (check(buf, "decl"), (buf = ""));
    else buf += ch;
  }
  if (depth !== 0) err(`unbalanced braces after comment-stripping (depth ${depth})`);
}

if (/data-theme|prefers-color-scheme/.test(css)) err("theme switching is the .dark class only — found data-theme or a colour-scheme query");

function block(selector) {
  const body = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) {
    console.error(`check-tokens: FAILED — no ${selector} block`);
    process.exit(1);
  }
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim().toLowerCase();
  return vars;
}
const light = block(":root");
const dark = block("\\.dark");

for (const k of Object.keys(light)) if (!(k in dark)) err(`.dark: missing --${k}`);
for (const k of Object.keys(dark)) if (!(k in light)) err(`:root: missing --${k}`);
for (const m of css.matchAll(/--color-([\w-]+)\s*:\s*var\(--([\w-]+)\)/g)) {
  if (!(m[2] in light)) err(`--color-${m[1]} points at --${m[2]}, which :root does not declare`);
}

const TAILWIND = {
  zinc: "fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b",
  blue: "eff6ff dbeafe bfdbfe 93c5fd 60a5fa 2563eb 1d4ed8 1e40af 1e3a8a 172554",
  green: "f0fdf4 dcfce7 bbf7d0 86efac 22c55e 16a34a 15803d 166534 14532d 052e16",
  violet: "f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065",
  orange: "fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407",
  pink: "fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724",
  red: "fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a",
};
const PALETTE = new Set(["#ffffff", "#000000", ...Object.values(TAILWIND).flatMap((s) => s.split(" ").map((h) => `#${h}`))]);
const NO_RED = new Set([...TAILWIND.orange.split(" "), ...TAILWIND.pink.split(" "), ...TAILWIND.red.split(" ")].map((h) => `#${h}`));

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

const PAIRS = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["foreground", "muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["primary", "background", 4.5],
  ["primary", "primary-muted", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["brand", "background", 4.5],
  ["brand", "brand-muted", 4.5],
  ["brand-foreground", "brand", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["accent2", "background", 4.5],
  ["accent2", "accent2-soft", 4.5],
  ["violet", "violet-soft", 4.5],
  ["teal", "teal-soft", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["destructive", "destructive-soft", 4.5],
  ["success", "background", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "background", 4.5],
  ["warning", "warning-soft", 4.5],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-muted", "sidebar", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
  ["foreground", "row-selected", 4.5],
  ["ring", "background", 3],
  ["disabled-foreground", "disabled", 3],
  ["placeholder", "background", 3],
];

function checkAppearance(vars, label) {
  for (const [k, v] of Object.entries(vars)) {
    if (!/^#[0-9a-f]{6}$/.test(v)) continue;
    if (!PALETTE.has(v)) err(`${label}--${k}: ${v} is not a Tailwind palette colour`);
    if (!k.startsWith("promo-") && NO_RED.has(v)) err(`${label}--${k}: ${v} is red, pink or orange — only the promo palette may be`);
  }
  if (vars.destructive !== vars.foreground) err(`${label}--destructive must equal --foreground (a problem is never red)`);
  if (vars.warning !== vars.foreground) err(`${label}--warning must equal --foreground`);
  if (vars.ring !== vars.primary) err(`${label}--ring must equal --primary`);
  if (vars.brand === vars.primary) err(`${label}--brand must not equal --primary (green is never the action colour)`);
  for (const [fg, bg, min] of PAIRS) {
    if (!vars[fg] || !vars[bg]) {
      err(`${label}pair --${fg} / --${bg} names a token that is not declared`);
      continue;
    }
    const r = ratio(vars[fg], vars[bg]);
    if (r < min) err(`${label}--${fg} on --${bg} is ${r.toFixed(2)}:1, below ${min}:1`);
  }
}
checkAppearance(light, "");
checkAppearance(dark, ".dark: ");

const remPx = (name) => {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`));
  return m ? Math.round(parseFloat(m[1]) * 16) : null;
};
const RADII = { "--radius-sm": 4, "--radius-md": 6, "--radius-lg": 8, "--radius-xl": 12, "--radius-sheet": 16, "--radius": 8 };
for (const [name, px] of Object.entries(RADII)) if (remPx(name) !== px) err(`${name} must be ${px}px, got ${remPx(name)}px`);

if (errors.length) {
  console.error("check-tokens: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-tokens: OK — one theme, ${Object.keys(light).length} tokens × light + dark, all Tailwind palette colours, every pair at AA`,
);
