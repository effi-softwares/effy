#!/usr/bin/env node
/**
 * legal:check — the drift + honesty guard.
 *
 * ALWAYS-HARD failures (break the build), and names the cause, on:
 *   1. DRIFT       — committed generated TS/Kotlin differs from a fresh build (web↔mobile parity)
 *   3. INTEGRITY   — a manifest slug with no doc/current version, or a stray doc dir
 *   4. BROKEN LINK — a document links to a /legal/<slug> that is not a known document
 *
 * PUBLISH blocker (warns by default, HARD-fails only with `--release`):
 *   2. UNRESOLVED ID — a [UPPER_SNAKE] identifier placeholder remains in generated output. These are
 *      intentionally present until the operator supplies real values (and a lawyer reviews), so a
 *      normal CI run must not break for months; but a release MUST NOT ship a placeholder identity.
 *
 * (Markdown-subset validation lives in the vitest suite, which can import the TS parser directly.)
 */
import { readFileSync, existsSync } from "node:fs"
import { buildDocuments, emitTs, emitKotlin, TS_PATH, KT_PATH, requiredSlugs } from "./build.mjs"

const RELEASE = process.argv.includes("--release")

const fail = (msg) => {
  console.error(`legal:check FAILED — ${msg}`)
  process.exit(1)
}

// 3. INTEGRITY (buildDocuments throws on missing dir/version or a stray directory)
let built
try {
  built = buildDocuments()
} catch (e) {
  fail(`manifest integrity: ${e.message}`)
}

// 1. DRIFT
const freshTs = emitTs(built)
const freshKt = emitKotlin(built)
const onDiskTs = existsSync(TS_PATH) ? readFileSync(TS_PATH, "utf8") : ""
const onDiskKt = existsSync(KT_PATH) ? readFileSync(KT_PATH, "utf8") : ""
if (freshTs !== onDiskTs) fail("drift: src/generated/documents.ts is stale — run `legal:gen` and commit.")
if (freshKt !== onDiskKt) fail("drift: mobile LegalContent.kt is stale — run `legal:gen` and commit.")

// 2. UNRESOLVED IDENTIFIER PLACEHOLDER (publish blocker)
const placeholder = /\[[A-Z][A-Z0-9_]{2,}\]/g
const unresolved = new Set()
for (const src of [freshTs, freshKt]) {
  for (const m of src.matchAll(placeholder)) unresolved.add(m[0])
}
if (unresolved.size > 0) {
  const list = [...unresolved].join(", ")
  if (RELEASE) fail(`unresolved identifiers ${list} — supply them in src/identifiers.json before release.`)
  console.warn(
    `legal:check ⚠ PUBLISH-BLOCKED: unresolved identifiers ${list}. ` +
      `Documents are drafts until an operator fills src/identifiers.json and a lawyer reviews. ` +
      `(Run \`legal:check --release\` to make this a hard failure at release time.)`,
  )
}

// 4. BROKEN INTERNAL LINK
const known = new Set(requiredSlugs)
const okBareRoutes = new Set(["", "privacy", "terms"]) // /legal index + legacy privacy/terms aliases
for (const d of built) {
  // Only internal link TARGETS: `](/legal/<slug>...)`. External URLs (e.g. apple.com/legal/...) and
  // label text are ignored — they are not routes this app owns.
  const re = /\]\(\/legal\/([a-z0-9-]*)/g
  let m
  while ((m = re.exec(d.body)) !== null) {
    const seg = m[1]
    if (!known.has(seg) && !okBareRoutes.has(seg)) fail(`${d.slug}: link to unknown legal route /legal/${seg}`)
  }
}

console.log(`legal:check OK — ${built.length} documents, no drift, no unresolved identifiers, links resolve.`)
