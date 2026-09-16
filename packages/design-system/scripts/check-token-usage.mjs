// TOKEN-REFERENCE GUARD — added by the platform-wide theme adoption.
//
// ⚠ WHAT THIS CATCHES THAT NOTHING ELSE COULD. Tailwind resolves `bg-brand-soft` by looking for
// `--color-brand-soft` in the `@theme` block. If that variable does not exist — because the utility
// was mistyped, or because a token was renamed and one call site was missed — Tailwind emits NO RULE
// AT ALL. There is no error, no warning, and no failing test: the element simply renders with no
// background, which on a white ground is indistinguishable from a deliberate design choice.
//
// That is the exact shape of defect this repository keeps recording (024's VectorDrawable compiled
// and produced nothing; 058's WriteTimeout passed every test and died only in production): valid,
// building, tested, wrong only where it runs. The theme adoption introduced fifteen new token names
// at once, which is the moment that risk is highest.
//
// It scans the web surfaces for colour utilities built on the platform's OWN token names and asserts
// each resolves. It deliberately ignores Tailwind's built-in palette (`bg-white`, `text-black`) and
// arbitrary values (`bg-[#fff]`) — those are other guards' business.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

// The declared vocabulary: every `--color-*` in tokens.css's @theme block.
const tokensCss = readFileSync(resolve(here, "../src/tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const declared = new Set(
  [...tokensCss.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]),
);
if (declared.size < 20) {
  console.error("check-token-usage: FAILED — only " + declared.size + " --color-* vars parsed; the guard is not reading tokens.css");
  process.exit(1);
}

// Utilities that take a colour token. `ring` and `border` also take widths (`ring-2`, `border-2`),
// and `outline` takes styles, so purely-numeric and keyword suffixes are skipped below.
const PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to",
  "outline", "decoration", "shadow", "accent", "caret", "divide", "placeholder",
];
const RE = new RegExp(
  `\\b(?:[a-z-]+:)*(${PREFIXES.join("|")})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\\b`,
  "g",
);

// Names that are Tailwind's own, not ours. A colour utility resolving to one of these is fine.
const BUILTIN = new Set([
  "white", "black", "transparent", "current", "inherit", "none", "auto",
  "solid", "dashed", "dotted", "double", "hidden", "px", "0", "full",
  "left", "right", "center", "top", "bottom", "start", "end", "clip", "ellipsis",
  "wrap", "nowrap", "balance", "pretty", "sm", "md", "lg", "xl", "2xl", "3xl",
  "xs", "base", "offset", "inset", "wide", "wider", "tight", "tighter", "normal",
  "pointer", "default", "not-allowed", "grab", "y", "x", "b", "t", "l", "r", "s", "e",
  "dark", "light", "sans", "mono", "serif", "justify", "opacity", "ring", "background",
]);

const files = [];
for (const app of ["apps/shop-web/src", "apps/back-office/src", "packages/web-kit/src", "packages/design-system/src/ui"]) {
  walk(resolve(root, app));
}
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) files.push(p);
  }
}

const unknown = new Map();
for (const f of files) {
  // Strip comments: prose legitimately names tokens that a file does not use.
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(RE)) {
    const name = m[2];
    if (BUILTIN.has(name)) continue;
    if (/^\d/.test(name)) continue; // ring-2, border-4, text-3xl handled above
    // Only judge names that look like OURS: they share a first segment with a declared token.
    const head = name.split("-")[0];
    const ours = [...declared].some((d) => d === head || d.startsWith(head + "-"));
    if (!ours) continue;
    if (declared.has(name)) continue;
    if (!unknown.has(name)) unknown.set(name, new Set());
    unknown.get(name).add(f.replace(root + "/", ""));
  }
}

if (unknown.size) {
  console.error("check-token-usage: FAILED\n" + [...unknown].map(([n, fs]) =>
    `  - \`${n}\` is used as a colour utility but tokens.css declares no --color-${n}. ` +
    `Tailwind emits NO RULE for it, so it renders as nothing.\n      ` + [...fs].join("\n      ")
  ).join("\n"));
  process.exit(1);
}
console.log(
  `check-token-usage: OK — ${files.length} files, every platform colour utility resolves to one of ${declared.size} declared tokens`,
);
