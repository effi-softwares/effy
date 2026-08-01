#!/usr/bin/env node
/**
 * derive-localities — turn a G-NAF download into `au-localities.csv` (spec 030, T003).
 *
 * G-NAF is ~1.7 GB of address records. This feature needs ~17 000 distinct
 * `(locality, state, postcode)` triples. **Only the triples are committed**, which is what keeps
 * `db/reference/` a small reference file rather than a repository of every address in Australia.
 *
 *     make derive-localities GNAF=~/Downloads/G-NAF_MAY26
 *
 * ── What it reads ──────────────────────────────────────────────────────────────────────────────
 *
 * G-NAF's Standard distribution is pipe-separated (PSV), one set of files per state, all under
 * `.../G-NAF <MONTH> <YEAR>/Standard/`:
 *
 *     {ST}_STATE_psv.psv            STATE_PID → STATE_ABBREVIATION
 *     {ST}_LOCALITY_psv.psv         LOCALITY_PID → LOCALITY_NAME, STATE_PID, LOCALITY_CLASS_CODE
 *     {ST}_ADDRESS_DETAIL_psv.psv   LOCALITY_PID, POSTCODE   ← the big one, streamed
 *
 * The postcode lives on the ADDRESS, not on the locality — which is precisely why a locality can
 * span several postcodes, and why the natural key is the triple (data-model.md).
 *
 * ⚠ FILE PATTERNS ARE ANCHORED TO THE WHOLE BASENAME, and that is load-bearing. An earlier draft
 * matched `/_LOCALITY_psv\.psv$/`, which ALSO matches `{ST}_STREET_LOCALITY_psv.psv` — a different
 * table, with a different column layout, holding STREET names. It would have loaded thousands of
 * street names into the suburb list and nothing would have complained. Found only by running against
 * the real download; a synthetic fixture has no such file to trip over.
 *
 * ⚠ ADDRESS_DETAIL is streamed, never buffered. It is tens of millions of rows; only the distinct
 * `(LOCALITY_PID, POSTCODE)` pairs are retained, which is a few tens of thousands.
 *
 * ── Rules it holds to ──────────────────────────────────────────────────────────────────────────
 *
 * ⚠ **Postcodes are TEXT, always.** NT postcodes begin `08xx`. Nothing here parses one as a number,
 *   and a value that is not exactly four digits is DROPPED with a count, never padded. Padding would
 *   repair a symptom and hide that something upstream had already destroyed the data.
 *
 * ⚠ **It rejects rather than repairs**, matching `localityload` on the Go side and the 029 image
 *   conformance check before it. Refusing is information; silently correcting is not.
 *
 * ⚠ **Output is deterministic** — sorted, LF-terminated, no timestamp inside the file. Running it
 *   twice on the same G-NAF release produces byte-identical output, so `git diff` shows real changes
 *   and nothing else. Same discipline as `packages/brand`'s generators.
 *
 * ⚠ **Retired addresses are skipped** (`DATE_RETIRED` non-empty). A retired address should not keep a
 *   postcode alive for a locality that no longer uses it.
 *
 * ── Licence ────────────────────────────────────────────────────────────────────────────────────
 *
 * G-NAF is published on data.gov.au under CC BY 4.0, which REQUIRES attribution. The attribution
 * lives in `db/reference/README.md` and must not be dropped. See specs/030 research R1.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "au-localities.csv")

/** The eight the `locality.state` CHECK constraint permits. */
const STATES = new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"])

/**
 * ⚠ G-NAF ships a NINTH pseudo-state, `OT` (Other Territories: Christmas Island, Cocos, Jervis Bay,
 * Norfolk Island). It is excluded, with a count, because `public.locality.state` permits exactly the
 * eight above — adding a ninth code to that constraint for territories Effy does not serve would be
 * schema churn for nothing. If Effy ever delivers there, this is the line to revisit, and SC-002's
 * coverage query is what would catch the omission.
 */
const EXCLUDED_STATES = new Set(["OT"])

/**
 * Locality classes worth offering a shopper as a place they live.
 *
 *   G  Gazetted locality  — the official suburbs; the overwhelming majority
 *   I  Indigenous         — communities people live in and name
 *   U  Unofficial         — names in real use that were never gazetted
 *
 * Excluded: `T` topographic features (mountains, bays), `D` districts, `H` South Australian cadastral
 * "hundreds". None of them is an answer to "where do you want this delivered?".
 */
const LOCALITY_CLASSES = new Set(["G", "I", "U"])

/** Read a PSV file line by line, yielding objects keyed by the header names. */
async function* readPsv(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let header = null
  for await (const line of rl) {
    if (!line) continue
    const cells = line.split("|")
    if (!header) {
      // ⚠ Address columns BY NAME, never by position. G-NAF has 30+ columns and their order is not
      // something to bet a dataset on.
      header = cells.map((h) => h.trim().toUpperCase().replace(/^﻿/, ""))
      continue
    }
    const row = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i]?.trim() ?? ""
    yield row
  }
}

/** Find a directory or file under `root` whose name matches, at any depth. */
function findAll(root, predicate, hits = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) findAll(full, predicate, hits)
    else if (predicate(entry.name)) hits.push(full)
  }
  return hits
}

async function main() {
  const root = process.argv[2] || process.env.GNAF
  if (!root) {
    console.error("usage: make derive-localities GNAF=/path/to/unzipped/G-NAF")
    process.exit(2)
  }
  const gnaf = resolve(root.replace(/^~/, process.env.HOME ?? "~"))
  if (!existsSync(gnaf) || !statSync(gnaf).isDirectory()) {
    console.error(`derive-localities: not a directory: ${gnaf}`)
    console.error("⚠ Point GNAF at the UNZIPPED G-NAF folder, not the .zip.")
    process.exit(2)
  }

  // ── 1. STATE_PID → abbreviation ──────────────────────────────────────────────────────────────
  // ⚠ Anchored to the whole basename. See the note at the top of this file.
  const stateFiles = findAll(gnaf, (n) => /^[A-Z]{2,3}_STATE_psv\.psv$/i.test(n))
  if (stateFiles.length === 0) {
    console.error("derive-localities: no {ST}_STATE_psv.psv found under", gnaf)
    console.error("⚠ Point GNAF at the folder containing 'G-NAF <MONTH> <YEAR>/Standard/'.")
    process.exit(2)
  }
  const stateByPid = new Map()
  let excludedStates = 0
  for (const f of stateFiles) {
    for await (const r of readPsv(f)) {
      const abbr = (r.STATE_ABBREVIATION || "").toUpperCase()
      if (!r.STATE_PID || !abbr) continue
      if (EXCLUDED_STATES.has(abbr)) {
        excludedStates++
        continue
      }
      if (STATES.has(abbr)) stateByPid.set(r.STATE_PID, abbr)
    }
  }
  console.log(
    `derive-localities: ${stateByPid.size} states from ${stateFiles.length} files` +
      (excludedStates ? ` (${excludedStates} excluded: ${[...EXCLUDED_STATES].join(", ")})` : ""),
  )

  // ── 2. LOCALITY_PID → { name, state } ────────────────────────────────────────────────────────
  // ⚠ `^[A-Z]{2,3}_LOCALITY_psv\.psv$` and NOT `_LOCALITY_psv\.psv$` — the loose form also matches
  // {ST}_STREET_LOCALITY_psv.psv and would load street names as suburbs.
  const localityFiles = findAll(gnaf, (n) => /^[A-Z]{2,3}_LOCALITY_psv\.psv$/i.test(n))
  const localityByPid = new Map()
  let wrongClass = 0
  let retiredLocality = 0
  for (const f of localityFiles) {
    for await (const r of readPsv(f)) {
      const name = (r.LOCALITY_NAME || "").trim()
      const state = stateByPid.get(r.STATE_PID)
      if (!r.LOCALITY_PID || !name || !state) continue
      if (r.DATE_RETIRED) {
        retiredLocality++
        continue
      }
      if (!LOCALITY_CLASSES.has((r.LOCALITY_CLASS_CODE || "").toUpperCase())) {
        wrongClass++
        continue
      }
      localityByPid.set(r.LOCALITY_PID, { name: titleCase(name), state })
    }
  }
  console.log(
    `derive-localities: ${localityByPid.size} localities from ${localityFiles.length} files ` +
      `(${retiredLocality} retired, ${wrongClass} not a residential locality class)`,
  )

  // ── 3. Stream ADDRESS_DETAIL for distinct (LOCALITY_PID, POSTCODE) ───────────────────────────
  const detailFiles = findAll(gnaf, (n) => /^[A-Z]{2,3}_ADDRESS_DETAIL_psv\.psv$/i.test(n))
  if (detailFiles.length === 0) {
    console.error("derive-localities: no {ST}_ADDRESS_DETAIL_psv.psv found under", gnaf)
    process.exit(2)
  }

  const pairs = new Set()
  let scanned = 0
  let droppedPostcode = 0
  let retired = 0
  for (const f of detailFiles) {
    for await (const r of readPsv(f)) {
      scanned++
      if (r.DATE_RETIRED) {
        retired++
        continue
      }
      const pid = r.LOCALITY_PID
      const postcode = (r.POSTCODE || "").trim()
      if (!pid) continue
      // ⚠ Exactly four digits, as TEXT. Not padded, not coerced — dropped and counted.
      if (!/^\d{4}$/.test(postcode)) {
        if (postcode) droppedPostcode++
        continue
      }
      pairs.add(`${pid} ${postcode}`)
    }
    process.stdout.write(`  scanned ${scanned.toLocaleString()} addresses\r`)
  }
  process.stdout.write("\n")

  // ── 4. Join, validate, sort ──────────────────────────────────────────────────────────────────
  const triples = new Set()
  let unknownLocality = 0
  for (const pair of pairs) {
    const [pid, postcode] = pair.split(" ")
    const loc = localityByPid.get(pid)
    if (!loc) {
      unknownLocality++
      continue
    }
    triples.add(`${loc.name} ${loc.state} ${postcode}`)
  }

  const rows = [...triples]
    .map((t) => t.split(" "))
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]))

  // ── 5. The guards, before anything is written ────────────────────────────────────────────────
  const leadingZero = rows.filter((r) => r[2].startsWith("0")).length
  const statesSeen = new Set(rows.map((r) => r[1]))

  if (rows.length === 0) {
    fail("produced no rows — the G-NAF layout was not what this script expects")
  }
  // ⚠ THE NORTHERN TERRITORY CANARY. NT postcodes begin 08xx. Zero of them means something in the
  // chain treated the column as a number, and the whole Territory would be unreachable by name.
  if (leadingZero === 0) {
    fail("no postcodes beginning with 0 — leading zeros were lost; refusing to write a corrupt dataset")
  }
  if (statesSeen.size !== 8) {
    fail(`expected all 8 states/territories, got ${statesSeen.size}: ${[...statesSeen].sort().join(" ")}`)
  }
  if (rows.length < 10_000 || rows.length > 40_000) {
    fail(`${rows.length} triples is outside the plausible 10k–40k range — check the G-NAF release`)
  }

  const csv = "locality,state,postcode\n" + rows.map(([n, s, p]) => `${csvCell(n)},${s},${p}\n`).join("")
  await writeFile(OUT, csv, "utf8")

  console.log(`derive-localities: wrote ${OUT}`)
  console.log(`  ${rows.length.toLocaleString()} triples · ${statesSeen.size} states · ${leadingZero.toLocaleString()} leading-zero postcodes`)
  console.log(`  scanned ${scanned.toLocaleString()} addresses (${retired.toLocaleString()} retired, ${droppedPostcode.toLocaleString()} with an unusable postcode, ${unknownLocality.toLocaleString()} with an unknown locality)`)
  console.log("⚠ G-NAF is CC BY 4.0 — keep the attribution in db/reference/README.md.")
}

/** G-NAF stores locality names in UPPER CASE; the shopper sees this string verbatim. */
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'()/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
    // Directional suffixes and the handful of forms that title-casing gets wrong on their own.
    .replace(/\bMc([a-z])/g, (_, c) => "Mc" + c.toUpperCase())
    .replace(/\bO'([a-z])/g, (_, c) => "O'" + c.toUpperCase())
}

/** RFC-4180 quoting — locality names contain commas, apostrophes and parentheses. */
function csvCell(v) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function fail(msg) {
  console.error(`derive-localities: ${msg}`)
  process.exit(1)
}

main().catch((err) => {
  console.error("derive-localities:", err?.stack || err)
  process.exit(1)
})
