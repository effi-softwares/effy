#!/usr/bin/env node
// PREVIEW — `make email-preview`. Renders every catalogued message against its committed fixture
// into dist/preview/, plus an index. No cloud access, no send, no secrets (spec FR-040 / SC-013).
//
// ⚠ IT USES THE SAME SUBSTITUTION AS PRODUCTION. A preview produced by a different code path can
// show something a recipient will never receive — which is this repository's single most-repeated
// documented failure mode (a fixture agreeing with the code instead of with the world). The one
// thing it cannot share is the CATALOGUE's subject/preheader functions, which are TypeScript; those
// are exercised by test/catalog.test.ts instead.
//
// ⚠ dist/preview/ is a BUILD OUTPUT and is gitignored, unlike the rest of dist/.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Handlebars from "handlebars";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, "..");
const DIST = resolve(PKG, "dist");
const SRC = resolve(PKG, "src");
const OUT = resolve(DIST, "preview");

// The values the layout injects at runtime. ⚠ Placeholders, not invented real-world identifiers:
// the postal address is operator-supplied and must never be guessed, not even for a preview.
const PLATFORM = {
  effyProductName: "Effy",
  effySupportEmail: "hello@effyshopping.com",
  effyPostalAddress: "[postal address — operator-supplied]",
};

function main() {
  if (!existsSync(resolve(DIST, "manifest.json"))) {
    console.error("✗ nothing to preview — run `make email-gen` first");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(resolve(DIST, "manifest.json"), "utf8"));
  const ids = Object.keys(manifest).sort();

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const rows = [];
  for (const id of ids) {
    const fixturePath = resolve(SRC, "fixtures", `${id}.json`);
    if (!existsSync(fixturePath)) {
      console.error(`✗ ${id}: no fixture at src/fixtures/${id}.json`);
      process.exit(1);
    }
    const vars = { ...JSON.parse(readFileSync(fixturePath, "utf8")), ...PLATFORM };

    const html = Handlebars.compile(readFileSync(resolve(DIST, `${id}.html`), "utf8"))(vars);
    const text = Handlebars.compile(readFileSync(resolve(DIST, `${id}.txt`), "utf8"))(vars);

    writeFileSync(resolve(OUT, `${id}.html`), html);
    writeFileSync(resolve(OUT, `${id}.txt.html`), `<pre style="font:14px ui-monospace,monospace;padding:24px;white-space:pre-wrap">${escapeHtml(text)}</pre>`);

    const m = manifest[id];
    rows.push(
      `<tr><td><a href="./${id}.html">${id}</a></td>` +
        `<td><a href="./${id}.txt.html">text</a></td>` +
        `<td style="text-align:right">${m.htmlBytes.toLocaleString()} B</td>` +
        `<td style="text-align:right">${m.htmlChars.toLocaleString()}</td></tr>`,
    );
  }

  writeFileSync(
    resolve(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Effy email preview</title>
<style>
 body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#1a1a1a}
 table{border-collapse:collapse;width:100%;margin-top:24px}
 th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e6e6e6}
 th{font-weight:600;color:#666} a{color:#1a1a1a}
 p{color:#666}
</style>
<h1>Effy email preview</h1>
<p>${ids.length} template(s), rendered against their committed fixtures. Nothing here was sent.</p>
<p>⚠ Budgets: Gmail clips at ~104,448 B. Messages routed through Cognito must also stay under
   ~20,000 <em>characters</em> — a separate, much tighter limit.</p>
<table><tr><th>Template</th><th>Text</th><th>HTML size</th><th>Chars</th></tr>
${rows.join("\n")}
</table>`,
  );

  console.log(`✓ email-preview — ${ids.length} template(s) → dist/preview/index.html`);
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

main();
