import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, "..");
const SRC = resolve(PKG, "src");
const DIST = resolve(PKG, "dist");

const GMAIL_WARN = 90 * 1024;
const GMAIL_FAIL = 102 * 1024;

const BANNED = [
  [/display\s*:\s*(flex|grid|inline-flex|inline-grid)/i, "flex/grid layout"],
  [/\bfloat\s*:\s*(left|right)/i, "float"],
  [/position\s*:\s*(absolute|fixed|sticky)/i, "positioned layout"],
  [/var\(\s*--/, "a CSS custom property"],
  [/^\s*--[a-z-]+\s*:/im, "a CSS custom property declaration"],
  [/@supports/i, "@supports"],
  [/\bclamp\(/i, "clamp()"],
  [/:has\(/i, ":has()"],
  [/\.svg["')\s]/i, "an SVG asset"],
  [/<svg[\s>]/i, "inline SVG"],
  [/<link[^>]+href=["']https?:/i, "an external stylesheet"],
  [/@import/i, "@import"],
  [/fonts\.(googleapis|gstatic)\.com/i, "Google Fonts"],
];

const REQUIRED = [
  [/^\s*<!doctype html>/i, "the HTML5 doctype"],
  [/<html[^>]*\blang="[a-z-]+"/i, "a lang attribute on <html>"],
  [/<html[^>]*\bdir="(ltr|rtl)"/i, "a dir attribute on <html>"],
  [/name="color-scheme"/, "the color-scheme meta tag"],
  [/name="supported-color-schemes"/, "the supported-color-schemes meta tag"],
  [/x-apple-disable-message-reformatting/, "the Apple Mail reformatting opt-out"],
  [/PixelsPerInch/, "the Outlook 96-DPI block"],
  [/charset=UTF-8/, "a charset declaration"],
  [/name="viewport"/, "a viewport meta tag"],
  [/font-family:\s*Arial, Helvetica, sans-serif !important/, "the Outlook font override"],
];

const problems = [];
const fail = (subject, message) => problems.push(`[${subject}] ${message}`);
const count = (text, re) => (text.match(re) ?? []).length;
const read = (path) => readFileSync(path, "utf8");

function generatedFiles() {
  const files = existsSync(DIST) ? readdirSync(DIST).filter((f) => f !== "preview").map((f) => resolve(DIST, f)) : [];
  const theme = resolve(SRC, "generated", "theme.mjml");
  return Object.fromEntries([...files, theme].filter(existsSync).map((path) => [path, read(path)]));
}

function checkDrift() {
  const before = generatedFiles();
  try {
    execFileSync(process.execPath, [resolve(here, "gen-email.mjs")], { stdio: "pipe" });
  } catch (err) {
    console.error(err.stderr?.toString() || err.message);
    process.exit(1);
  }
  const after = generatedFiles();
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[path] !== after[path]) {
      fail(path.slice(PKG.length + 1), "is stale - run `make email-gen` and commit the result");
    }
  }
}

function checkSources() {
  for (const dir of ["templates", "components"]) {
    for (const file of readdirSync(resolve(SRC, dir)).filter((f) => f.endsWith(".mjml"))) {
      const source = read(resolve(SRC, dir, file));
      const subject = `${dir}/${file}`;
      if (/<!--/.test(source)) fail(subject, "has an HTML comment");
      if (/(?<!&)#[0-9a-fA-F]{3,8}\b/.test(source)) fail(subject, "writes a hex colour - use an mj-class or a %role% colour");
      if (/font-family/i.test(source)) fail(subject, "writes a font-family - the theme sets it");
      if (/\{\{\{/.test(source)) fail(subject, "uses {{{ }}}, which turns off escaping");
    }
  }
}

function checkHtml(id, html) {
  for (const [re, what] of REQUIRED) if (!re.test(html)) fail(id, `is missing ${what}`);
  for (const [re, what] of BANNED) if (re.test(html)) fail(id, `uses ${what}, which email clients do not support`);

  const body = html.slice(html.indexOf("<body"));
  if (/<style[\s>]/i.test(body)) fail(id, "has a <style> inside <body>, which Gmail ignores");
  for (const [, block] of html.matchAll(/@media[^{]*\{([\s\S]*?)\n\s*\}/g)) {
    if (/@(media|font-face|import|supports)/.test(block)) fail(id, "nests an @ rule inside @media, which makes Gmail drop the styles");
  }
  if (count(html, /<!--\[if/g) !== count(html, /<!\[endif\]-->/g)) fail(id, "has unbalanced Outlook conditional comments");
  if (/<!--(?!\[if|<!\[endif|>)[\s\S]*?-->/.test(html)) fail(id, "ships an HTML comment");
  if (count(html, /<h1[\s>]/g) !== 1) fail(id, "must have exactly one <h1>");
  if (count(html, /<table[\s>]/g) !== count(html, /<table[^>]*role="presentation"/g)) {
    fail(id, 'has a <table> without role="presentation"');
  }
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(img) || !/\bwidth=/.test(img)) fail(id, "has an <img> without alt and width");
  }

  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > GMAIL_FAIL) fail(id, `is ${bytes} B - over Gmail's ~${GMAIL_FAIL} B clip`);
  else if (bytes > GMAIL_WARN) console.warn(`  ⚠ ${id} is ${bytes} B - close to Gmail's clip`);
}

function checkText(id, text) {
  if (text.trim().length < 80) fail(id, "has a plain-text part under 80 characters");
  if (/<[a-z][^>]*>/i.test(text)) fail(id, "has markup in its plain-text part");
  if (/&#\d+;|&[a-z]+;/i.test(text)) fail(id, "has HTML entities in its plain-text part");
}

function checkFixture(id) {
  const path = resolve(SRC, "fixtures", `${id}.json`);
  if (!existsSync(path)) return fail(id, `has no fixture at src/fixtures/${id}.json`);
  try {
    JSON.parse(read(path));
  } catch {
    fail(id, "has a fixture that is not valid JSON");
  }
}

checkDrift();
checkSources();
const ids = Object.keys(JSON.parse(read(resolve(DIST, "manifest.json"))));
for (const id of ids) {
  checkHtml(id, read(resolve(DIST, `${id}.html`)));
  checkText(id, read(resolve(DIST, `${id}.txt`)));
  checkFixture(id);
}

if (problems.length) {
  console.error(`✗ email-check - ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ email-check - ${ids.length} template(s) clean`);
