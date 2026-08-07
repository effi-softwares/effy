#!/usr/bin/env node
// EMAIL GUARD — `make email-check`.
//
// ⚠ EVERY FAILURE NAMES THE TEMPLATE. A guard that says "something is wrong" is a guard nobody acts
// on. Proven by deliberately breaking each check (spec SC-010) — the method 024 established, which
// found a live defect the first time it was applied.
//
// Zero dependencies (Node stdlib + mjml, which is already a build dep), like
// design-system/scripts/check-tokens.mjs and packages/brand's checker.
//
// ⚠ SCOPE SPLIT, deliberate: this script owns everything derivable from the TOKENS and the COMPILED
// ARTIFACTS. Checks that need the catalogue's TypeScript (per-message size budgets, {####} placement,
// category/unsubscribe, placeholder-vs-schema agreement) live in test/catalog.test.ts, because the
// catalogue is the SSOT and must not be duplicated into a second parseable form just to satisfy a
// .mjs script. `pnpm test` runs both.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { buildEmailTokens, validateEmailTokens } from "./lib/tokens.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, "..");
const DIST = resolve(PKG, "dist");
const SRC = resolve(PKG, "src");

const failures = [];
const fail = (template, msg) => failures.push(`[${template}] ${msg}`);

// ── Budgets ───────────────────────────────────────────────────────────────────────────────────
// ⚠ Gmail clips at ~102 KB of raw HTML and hides everything past the cut behind "[Message clipped]".
// It is NOT deterministic — clipping below 102 KB has been observed with certain characters — so the
// warn line carries 10% headroom.
const GMAIL_WARN = 90 * 1024;
const GMAIL_FAIL = 102 * 1024;

// ── The banned techniques (research: the caniemail-derived ban list) ───────────────────────────
const BANNED = [
  [/display\s*:\s*(flex|grid|inline-flex|inline-grid)/i, "flex/grid layout — no Word-engine support"],
  [/\bfloat\s*:\s*(left|right)/i, "float — dropped in Outlook.com and the Word engine"],
  [/position\s*:\s*(absolute|fixed|sticky)/i, "positioned layout — unsupported or partial everywhere"],
  [/var\(\s*--/, "CSS custom property — unsupported in Gmail, every Word Outlook, Outlook.com, Yahoo"],
  [/^\s*--[a-z-]+\s*:/im, "CSS custom property declaration — same reason"],
  [/@supports/i, "@supports — not a mail feature"],
  [/\bclamp\(/i, "clamp() — unreliable in the Word engine"],
  [/:has\(/i, ":has() — not a mail feature"],
  [/\.svg["')\s]/i, "SVG asset — blocked across Gmail, Outlook and Yahoo since late 2025"],
  [/<svg[\s>]/i, "inline <svg> — same reason"],
];

// ── Required head furniture ───────────────────────────────────────────────────────────────────
const REQUIRED_META = [
  ['name="color-scheme"', "the color-scheme declaration (it is what makes Apple Mail leave the palette alone)"],
  ['name="supported-color-schemes"', "the supported-color-schemes declaration"],
  ["x-apple-disable-message-reformatting", "the Apple Mail reformatting opt-out"],
  ["PixelsPerInch", "the 96-DPI block — without it the Word engine scales attributes by 1.25x at 120 DPI"],
  // MJML emits this as `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">`,
  // not as a standalone `<meta charset>`, so the probe matches the substring both forms share.
  ["charset=UTF-8", "a charset declaration"],
  ['name="viewport"', "a viewport declaration"],
];

function checkStructure(id, html) {
  // Doctype.
  if (!/^\s*<!doctype html>/i.test(html)) fail(id, "does not begin with the HTML5 doctype");

  // lang / dir.
  if (!/<html[^>]*\blang="[a-z-]+"/i.test(html)) fail(id, "the <html> element has no lang attribute");
  if (!/<html[^>]*\bdir="(ltr|rtl)"/i.test(html)) fail(id, "the <html> element has no dir attribute");

  // Head furniture.
  for (const [probe, what] of REQUIRED_META) {
    if (!html.includes(probe)) fail(id, `is missing ${what}`);
  }

  // ⚠ No <style> inside <body>: Gmail ignores it entirely.
  const bodyStart = html.indexOf("<body");
  if (bodyStart > -1 && /<style[\s>]/i.test(html.slice(bodyStart))) {
    fail(id, "has a <style> element inside <body> — Gmail ignores it");
  }

  // ⚠ A nested @ rule makes Gmail discard the ENTIRE style block.
  for (const m of html.matchAll(/@media[^{]*\{([\s\S]*?)\n\s*\}/g)) {
    if (/@(media|font-face|import|supports)/.test(m[1])) {
      fail(id, "nests an @ rule inside @media — Gmail discards the whole style block");
    }
  }

  // Balanced MSO conditionals.
  const opens = (html.match(/<!--\[if/g) ?? []).length;
  const closes = (html.match(/<!\[endif\]-->/g) ?? []).length;
  if (opens !== closes) {
    fail(id, `has ${opens} conditional-comment openers and ${closes} closers`);
  }

  // ⚠ Exactly one semantic heading. MJML renders mj-text as <div>, so this only passes because the
  // generator promotes the e-h1 cell — see promoteHeading() in gen-email.mjs.
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) fail(id, `has ${h1s} <h1> elements — a message has exactly one`);

  // Layout tables must be marked presentational or a screen reader reads them cell by cell.
  const tables = (html.match(/<table[\s>]/g) ?? []).length;
  const presentational = (html.match(/<table[^>]*role="presentation"/g) ?? []).length;
  if (tables !== presentational) {
    fail(id, `${tables - presentational} of ${tables} tables lack role="presentation"`);
  }

  // Every image needs alt (empty is fine and meaningful; missing is not).
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) fail(id, "has an <img> with no alt attribute");
    if (!/\bwidth=/.test(m[0])) fail(id, "has an <img> with no width attribute");
  }

  // The Word engine must not be left to pick a font.
  if (!/font-family:\s*Arial, Helvetica, sans-serif !important/.test(html)) {
    fail(id, "has no <!--[if mso]> font override — classic Outlook would render it in Times New Roman");
  }

  // ⚠ NO EXTERNAL REQUESTS FROM THE HEAD. MJML injects a Google Fonts link/@import for any family
  // in its default map that appears in a font-family — our stack names Roboto, so every message
  // silently carried a request to fonts.googleapis.com until `fonts: {}` was set. That is a
  // third-party dependency and a privacy leak on the platform's most sensitive mail.
  if (/<link[^>]+href=["']https?:/i.test(html)) {
    fail(id, "loads an external stylesheet — email must carry no third-party requests");
  }
  if (/@import/i.test(html)) {
    fail(id, "uses @import — an external request, and an @ rule Gmail is fragile about");
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html)) {
    fail(id, "references Google Fonts — set `fonts: {}` on the MJML compile");
  }

  // Banned techniques.
  for (const [re, why] of BANNED) {
    if (re.test(html)) fail(id, `uses a banned technique: ${why}`);
  }

  // ⚠ Internal commentary must not ship inside customer email. This shipped once (MJML's
  // keepComments defaults to true) and put reasoning about phishing primitives into every message.
  const comments = html.match(/<!--(?!\[if|<!\[endif)[\s\S]*?-->/g) ?? [];
  const prose = comments.filter((c) => c.length > 120);
  if (prose.length) {
    fail(id, `ships ${prose.length} long HTML comment(s) — authoring notes must not reach recipients`);
  }
}

function checkSize(id, html) {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > GMAIL_FAIL) {
    fail(id, `is ${bytes} B — over Gmail's ~${GMAIL_FAIL} B clip threshold; it would truncate mid-message`);
  } else if (bytes > GMAIL_WARN) {
    console.warn(`  ⚠ ${id} is ${bytes} B — within 10% of Gmail's clip threshold`);
  }
}

function checkText(id, text) {
  if (!text.trim()) {
    fail(id, "has an empty plain-text part");
  }
  if (/<[a-z][^>]*>/i.test(text)) {
    fail(id, "has markup in its plain-text part — it must be authored, not stripped from the HTML");
  }
  if (/&#\d+;|&[a-z]+;/i.test(text)) {
    fail(id, "has HTML entities in its plain-text part — several Android clients show these raw");
  }
  if (text.length < 80) {
    fail(id, "has a plain-text part under 80 characters — it must carry the real message");
  }
}

function main() {
  // ── 1. Tokens ───────────────────────────────────────────────────────────────────────────────
  let tokens;
  try {
    tokens = buildEmailTokens();
  } catch (err) {
    console.error("✗ " + err.message);
    process.exit(1);
  }
  for (const e of validateEmailTokens(tokens)) failures.push(`[tokens] ${e}`);

  // ── 2. Artifacts exist ──────────────────────────────────────────────────────────────────────
  if (!existsSync(DIST) || !existsSync(resolve(DIST, "manifest.json"))) {
    console.error("✗ dist/ is missing or has no manifest — run `make email-gen`");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(resolve(DIST, "manifest.json"), "utf8"));
  const ids = Object.keys(manifest).sort();

  const srcIds = readdirSync(resolve(SRC, "templates"))
    .filter((f) => f.endsWith(".mjml"))
    .map((f) => f.replace(/\.mjml$/, ""))
    .sort();
  if (JSON.stringify(ids) !== JSON.stringify(srcIds)) {
    failures.push(
      `[manifest] lists ${ids.join(", ") || "(none)"} but src/templates holds ${srcIds.join(", ") || "(none)"} — run \`make email-gen\``,
    );
  }

  // ── 3. Per-template checks ──────────────────────────────────────────────────────────────────
  const bundleSrc = existsSync(resolve(DIST, "templates.generated.ts"))
    ? readFileSync(resolve(DIST, "templates.generated.ts"), "utf8")
    : "";
  if (!bundleSrc) failures.push("[dist] templates.generated.ts is missing — run `make email-gen`");

  for (const id of ids) {
    const htmlPath = resolve(DIST, `${id}.html`);
    const textPath = resolve(DIST, `${id}.txt`);
    if (!existsSync(htmlPath)) { fail(id, "has no compiled HTML in dist/"); continue; }
    if (!existsSync(textPath)) { fail(id, "has no plain-text part in dist/"); continue; }

    const html = readFileSync(htmlPath, "utf8");
    const text = readFileSync(textPath, "utf8");

    checkStructure(id, html);
    checkSize(id, html);
    checkText(id, text);

    // ⚠ THE TWO-ARTIFACT GUARD. dist/<id>.html is the review artifact; templates.generated.ts is what
    // the Lambda bundler sees. They are written by one generator pass and MUST carry identical
    // content — otherwise a reviewer approves one thing and recipients receive another.
    if (bundleSrc && !bundleSrc.includes(JSON.stringify(html))) {
      fail(id, "dist/<id>.html and templates.generated.ts disagree — the reviewed HTML is not the shipped HTML");
    }
    if (bundleSrc && !bundleSrc.includes(JSON.stringify(text))) {
      fail(id, "dist/<id>.txt and templates.generated.ts disagree on the text part");
    }

    // A fixture must exist, and must parse.
    const fixture = resolve(SRC, "fixtures", `${id}.json`);
    if (!existsSync(fixture)) {
      fail(id, "has no fixture at src/fixtures/<id>.json — it cannot be previewed or verified");
    } else {
      try { JSON.parse(readFileSync(fixture, "utf8")); }
      catch { fail(id, "has a fixture that is not valid JSON"); }
    }
  }

  // ── 4. Drift ────────────────────────────────────────────────────────────────────────────────
  // ⚠ Regenerate and compare. Snapshotting the committed artifacts and re-running the generator is
  // what makes this reliable in a dirty worktree, rather than depending on git staging state.
  const before = ids.map((id) => [
    readFileSync(resolve(DIST, `${id}.html`), "utf8"),
    readFileSync(resolve(DIST, `${id}.txt`), "utf8"),
  ]);
  const themeBefore = existsSync(resolve(SRC, "generated/theme.mjml"))
    ? readFileSync(resolve(SRC, "generated/theme.mjml"), "utf8")
    : null;
  const tokensBefore = existsSync(resolve(SRC, "generated/tokens.generated.ts"))
    ? readFileSync(resolve(SRC, "generated/tokens.generated.ts"), "utf8")
    : null;

  try {
    execFileSync(process.execPath, [resolve(here, "gen-email.mjs")], { stdio: "pipe" });
  } catch (err) {
    console.error("✗ the generator itself failed:\n" + (err.stderr?.toString() ?? err.message));
    process.exit(1);
  }

  ids.forEach((id, i) => {
    if (readFileSync(resolve(DIST, `${id}.html`), "utf8") !== before[i][0]) {
      fail(id, "the committed HTML is STALE — regenerating changed it; run `make email-gen` and commit");
    }
    if (readFileSync(resolve(DIST, `${id}.txt`), "utf8") !== before[i][1]) {
      fail(id, "the committed text part is STALE — run `make email-gen` and commit");
    }
  });
  if (themeBefore !== null && readFileSync(resolve(SRC, "generated/theme.mjml"), "utf8") !== themeBefore) {
    failures.push("[theme] src/generated/theme.mjml is STALE — the design tokens moved under it");
  }
  if (tokensBefore !== null && readFileSync(resolve(SRC, "generated/tokens.generated.ts"), "utf8") !== tokensBefore) {
    failures.push("[tokens] src/generated/tokens.generated.ts is STALE — run `make email-gen`");
  }

  // ── Report ──────────────────────────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(`✗ email-check — ${failures.length} problem(s):\n`);
    for (const f of failures) console.error("  " + f);
    console.error("");
    process.exit(1);
  }
  console.log(`✓ email-check — ${ids.length} template(s), tokens + structure + size + text + drift clean`);
}

main();
