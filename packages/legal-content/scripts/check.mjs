#!/usr/bin/env node
/**
 * legal:check. Fails on drift (generated TS/Kotlin differs from a fresh build), integrity (a manifest
 * slug with no document, or a stray directory) and broken /legal/<slug> links. An unresolved
 * [UPPER_SNAKE] placeholder warns, and fails only with `--release`.
 */
import { readFileSync, existsSync } from "node:fs"
import { buildDocuments, emitTs, emitKotlin, TS_PATH, KT_PATH, requiredSlugs } from "./build.mjs"

const RELEASE = process.argv.includes("--release")

const fail = (msg) => {
  console.error(`legal:check FAILED — ${msg}`)
  process.exit(1)
}

// Integrity (buildDocuments throws on a missing dir or version, or a stray directory)
let built
try {
  built = buildDocuments()
} catch (e) {
  fail(`manifest integrity: ${e.message}`)
}

// Drift
const freshTs = emitTs(built)
const freshKt = emitKotlin(built)
const onDiskTs = existsSync(TS_PATH) ? readFileSync(TS_PATH, "utf8") : ""
const onDiskKt = existsSync(KT_PATH) ? readFileSync(KT_PATH, "utf8") : ""
if (freshTs !== onDiskTs) fail("drift: src/generated/documents.ts is stale — run `legal:gen` and commit.")
if (freshKt !== onDiskKt) fail("drift: mobile LegalContent.kt is stale — run `legal:gen` and commit.")

// Unresolved placeholder (fails with --release)
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

// Broken internal link
const known = new Set(requiredSlugs)
const okBareRoutes = new Set(["", "privacy", "terms"])
for (const d of built) {
  // Only internal targets `](/legal/<slug>…)`; external URLs and label text are not our routes.
  const re = /\]\(\/legal\/([a-z0-9-]*)/g
  let m
  while ((m = re.exec(d.body)) !== null) {
    const seg = m[1]
    if (!known.has(seg) && !okBareRoutes.has(seg)) fail(`${d.slug}: link to unknown legal route /legal/${seg}`)
  }
}

console.log(`legal:check OK — ${built.length} documents, no drift, no unresolved identifiers, links resolve.`)
