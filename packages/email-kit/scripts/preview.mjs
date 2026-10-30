import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(PKG, "dist");
const OUT = resolve(DIST, "preview");

const PLATFORM = {
  effyProductName: "Effy",
  effySupportEmail: "hello@effyshopping.com",
  effyPostalAddress: "[postal address]",
};

const read = (path) => readFileSync(path, "utf8");
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const manifestPath = resolve(DIST, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("✗ nothing to preview - run `make email-gen` first");
  process.exit(1);
}
const manifest = JSON.parse(read(manifestPath));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const rows = Object.entries(manifest).map(([id, { htmlBytes, htmlChars }]) => {
  const vars = { ...JSON.parse(read(resolve(PKG, "src", "fixtures", `${id}.json`))), ...PLATFORM };
  const html = Handlebars.compile(read(resolve(DIST, `${id}.html`)))(vars);
  const text = Handlebars.compile(read(resolve(DIST, `${id}.txt`)), { noEscape: true })(vars);
  writeFileSync(resolve(OUT, `${id}.html`), html);
  writeFileSync(
    resolve(OUT, `${id}.txt.html`),
    `<pre style="font:14px ui-monospace,monospace;padding:24px;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  );
  return (
    `<tr><td><a href="./${id}.html">${id}</a></td><td><a href="./${id}.txt.html">text</a></td>` +
    `<td align="right">${htmlBytes.toLocaleString()} B</td><td align="right">${htmlChars.toLocaleString()}</td></tr>`
  );
});

writeFileSync(
  resolve(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Effy email preview</title>
<style>
 body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px}
 table{border-collapse:collapse;width:100%}
 th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e4e4e7}
</style>
<h1>Effy email preview</h1>
<p>${rows.length} template(s), rendered with their fixtures. Nothing was sent.</p>
<table><tr><th>Template</th><th>Text</th><th>HTML</th><th>Characters</th></tr>
${rows.join("\n")}
</table>`,
);

console.log(`✓ email-preview - ${rows.length} template(s) → dist/preview/index.html`);
