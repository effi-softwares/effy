import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mjml2html from "mjml";

import { buildThemeMjml } from "./lib/theme.mjs";
import { loadEmailTokens } from "./lib/tokens.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(PKG, "src");
const TEMPLATES = resolve(SRC, "templates");
const DIST = resolve(PKG, "dist");

function resolveColours(html, tokens, file) {
  return html.replace(/%([a-zA-Z]+)%/g, (_, role) => {
    const value = tokens.light[role];
    if (!value) throw new Error(`${file}: %${role}% is not an email colour role`);
    return value;
  });
}

function promoteHeading(html, file) {
  const cell = /<td([^>]*\bclass="[^"]*\be-h1\b[^"]*"[^>]*)>([\s\S]*?)<\/td>/g;
  const cells = [...html.matchAll(cell)];
  if (cells.length === 0) return html;
  if (cells.length > 1) throw new Error(`${file}: ${cells.length} e-h1 headings — a message has exactly one <h1>`);

  const [whole, attrs, inner] = cells[0];
  const div = inner.match(/<div(\s[^>]*)?>([\s\S]*?)<\/div>/);
  if (!div) throw new Error(`${file}: the e-h1 cell has no element to promote`);
  const divAttrs = div[1] ?? "";
  const headingAttrs = divAttrs.includes('style="')
    ? divAttrs.replace('style="', 'style="margin:0;')
    : `${divAttrs} style="margin:0;"`;
  return html.replace(whole, `<td${attrs}>${inner.replace(div[0], `<h1${headingAttrs}>${div[2]}</h1>`)}</td>`);
}

function compile(id, tokens) {
  const filePath = resolve(TEMPLATES, `${id}.mjml`);
  const file = basename(filePath);
  const { html, errors } = mjml2html(readFileSync(filePath, "utf8"), {
    filePath,
    validationLevel: "strict",
    keepComments: false,
    minify: false,
    fonts: {},
  });
  if (errors?.length) {
    throw new Error(`MJML refused ${file}:\n${errors.map((e) => `      ${e.formattedMessage ?? e.message}`).join("\n")}`);
  }
  return promoteHeading(resolveColours(html, tokens, file), file);
}

function readText(id) {
  const path = resolve(SRC, "text", `${id}.txt.hbs`);
  if (!existsSync(path)) throw new Error(`${id}: no plain-text part at src/text/${id}.txt.hbs`);
  return readFileSync(path, "utf8");
}

function bundleSource(templates) {
  const entries = Object.entries(templates).map(
    ([id, { html, text }]) =>
      `  ${JSON.stringify(id)}: {\n    html: ${JSON.stringify(html)},\n    text: ${JSON.stringify(text)},\n  },`,
  );
  return [
    "export interface CompiledTemplate {",
    "  readonly html: string;",
    "  readonly text: string;",
    "}",
    "",
    "export const COMPILED_TEMPLATES: Readonly<Record<string, CompiledTemplate>> = {",
    ...entries,
    "};",
    "",
  ].join("\n");
}

function main() {
  const tokens = loadEmailTokens();
  mkdirSync(resolve(SRC, "generated"), { recursive: true });
  writeFileSync(resolve(SRC, "generated", "theme.mjml"), buildThemeMjml(tokens));

  const ids = readdirSync(TEMPLATES)
    .filter((f) => f.endsWith(".mjml"))
    .map((f) => f.slice(0, -".mjml".length))
    .sort();
  if (!ids.length) throw new Error("no templates found in src/templates");

  const templates = Object.fromEntries(ids.map((id) => [id, { html: compile(id, tokens), text: readText(id) }]));

  mkdirSync(DIST, { recursive: true });
  for (const f of readdirSync(DIST)) {
    if (f !== "preview") rmSync(resolve(DIST, f), { recursive: true });
  }

  const manifest = {};
  for (const [id, { html, text }] of Object.entries(templates)) {
    writeFileSync(resolve(DIST, `${id}.html`), html);
    writeFileSync(resolve(DIST, `${id}.txt`), text);
    manifest[id] = {
      htmlBytes: Buffer.byteLength(html, "utf8"),
      htmlChars: [...html].length,
      textBytes: Buffer.byteLength(text, "utf8"),
    };
  }
  writeFileSync(resolve(DIST, "templates.generated.ts"), bundleSource(templates));
  writeFileSync(resolve(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`✓ email-gen — ${ids.length} template(s)`);
  for (const [id, m] of Object.entries(manifest)) {
    console.log(`    ${id.padEnd(32)} ${String(m.htmlBytes).padStart(6)} B html · ${String(m.textBytes).padStart(5)} B text`);
  }
}

try {
  main();
} catch (err) {
  console.error(`✗ email-gen — ${err.message}`);
  process.exit(1);
}
