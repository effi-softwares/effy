// Token reference guard. Tailwind emits no rule at all for a colour utility whose `--color-*` is not
// in `@theme`, so a mistyped or renamed token renders as nothing with no error. This scans the web
// surfaces for utilities built on the platform's own token names and asserts each resolves (Tailwind's
// palette and arbitrary values are ignored).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

// The declared vocabulary: every `--color-*` in tokens.css's @theme.
function declaredIn(file) {
  const css = readFileSync(resolve(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...css.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]));
}

const consoleDeclared = declaredIn("../src/tokens.css");
if (consoleDeclared.size < 20) {
  console.error("check-token-usage: FAILED — only " + consoleDeclared.size + " --color-* vars parsed; the guard is not reading tokens.css");
  process.exit(1);
}
// customer-web imports the storefront @theme instead, where a console name emits no rule.
const storefrontDeclared = declaredIn("../src/storefront/tokens.css");
if (storefrontDeclared.size < 15) {
  console.error("check-token-usage: FAILED — only " + storefrontDeclared.size + " --color-* vars parsed from storefront/tokens.css");
  process.exit(1);
}

// back-office imports its own @theme (held to every console name by check-backoffice-tokens.mjs) with its own roles.
const backofficeDeclared = declaredIn("../src/backoffice/tokens.css");
if (backofficeDeclared.size < consoleDeclared.size) {
  console.error("check-token-usage: FAILED — backoffice/tokens.css declares fewer --color-* vars than tokens.css");
  process.exit(1);
}

const PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to",
  "outline", "decoration", "shadow", "accent", "caret", "divide", "placeholder",
];
const RE = new RegExp(
  `\\b(?:[a-z-]+:)*(${PREFIXES.join("|")})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\\b`,
  "g",
);

// Tailwind's own names.
const BUILTIN = new Set([
  "white", "black", "transparent", "current", "inherit", "none", "auto",
  "solid", "dashed", "dotted", "double", "hidden", "px", "0", "full",
  "left", "right", "center", "top", "bottom", "start", "end", "clip", "ellipsis",
  "wrap", "nowrap", "balance", "pretty", "sm", "md", "lg", "xl", "2xl", "3xl",
  "xs", "base", "offset", "inset", "wide", "wider", "tight", "tighter", "normal",
  "pointer", "default", "not-allowed", "grab", "y", "x", "b", "t", "l", "r", "s", "e",
  "dark", "light", "sans", "mono", "serif", "justify", "opacity", "ring", "background",
]);

function walk(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === "node_modules" || e === ".next") continue;
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) files.push(p);
  }
}

// `declared` is the surface's @theme; `known` is every name in any identity, so another identity's name is caught.
function scan(label, file, declared, known, roots) {
  const files = [];
  for (const r of roots) walk(resolve(root, r), files);
  const unknown = new Map();
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(RE)) {
      const name = m[2];
      if (BUILTIN.has(name)) continue;
      if (/^\d/.test(name)) continue; // ring-2, border-4, text-3xl handled above
      const head = name.split("-")[0];
      const ours = [...known].some((d) => d === head || d.startsWith(head + "-"));
      if (!ours) continue;
      if (declared.has(name)) continue;
      if (!unknown.has(name)) unknown.set(name, new Set());
      unknown.get(name).add(f.replace(root + "/", ""));
    }
  }
  if (unknown.size) {
    console.error(`check-token-usage: FAILED (${label})\n` + [...unknown].map(([n, fs]) =>
      `  - \`${n}\` is used as a colour utility but ${file} declares no --color-${n}. ` +
      `Tailwind emits NO RULE for it, so it renders as nothing.\n      ` + [...fs].join("\n      ")
    ).join("\n"));
    return false;
  }
  console.log(
    `check-token-usage: OK (${label}) — ${files.length} files, every colour utility resolves to one of ${declared.size} declared tokens`,
  );
  return true;
}

const everyToken = new Set([...consoleDeclared, ...storefrontDeclared, ...backofficeDeclared]);
const ok = [
  // The shared kit renders under either console identity, so it may use only the console names.
  scan("console", "tokens.css", consoleDeclared, consoleDeclared, [
    "packages/web-kit/src",
    "packages/design-system/src/ui",
  ]),
  // Both internal consoles wear the back-office identity (shop-web since its 2026-10-24 redesign).
  scan("back-office", "backoffice/tokens.css", backofficeDeclared, everyToken, [
    "apps/back-office/src",
    "apps/shop-web/src",
  ]),
  scan("storefront", "storefront/tokens.css", storefrontDeclared, everyToken, [
    "apps/customer-web/app",
    "apps/customer-web/components",
  ]),
];
if (ok.includes(false)) process.exit(1);
