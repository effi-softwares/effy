// Drift check: fails when a committed asset no longer matches the authored mark. Rebuilds every asset
// in memory and compares sha256 per file. Never modifies the working tree.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { resolve, join, relative } from "node:path"

import { buildAll, buildManifest, REPO, PKG, MANIFEST, sha256 } from "./gen-brand-assets.mjs"
import { MANAGED_DIRS, MANAGED_DIR_EXEMPT, MANAGED_SUBDIR_EXEMPT } from "../src/targets.mjs"

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

async function main() {
  const { mark, files } = await buildAll()

  const missing = []
  const stale = []
  for (const f of files) {
    const dest = resolve(REPO, f.path)
    if (!existsSync(dest)) {
      missing.push(f)
      continue
    }
    if (sha256(readFileSync(dest)) !== sha256(f.bytes)) stale.push(f)
  }

  // Orphans: a file under a managed directory that no target declares.
  const declared = new Set(files.map((f) => f.path))
  const orphans = []
  for (const dir of MANAGED_DIRS) {
    for (const abs of walk(resolve(REPO, dir))) {
      const rel = relative(REPO, abs).split("\\").join("/")
      const base = rel.split("/").pop()
      // Content directories are skipped by path (MANAGED_SUBDIR_EXEMPT).
      if (MANAGED_SUBDIR_EXEMPT.some((d) => rel.startsWith(`${d}/`))) continue
      if (!declared.has(rel) && !MANAGED_DIR_EXEMPT.includes(base)) orphans.push(rel)
    }
  }

  // The manifest must describe this run, or the check would pass on stale truth.
  const expectedManifest = buildManifest(mark, files)
  const manifestStale =
    !existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== expectedManifest

  const problems = missing.length + stale.length + orphans.length + (manifestStale ? 1 : 0)
  if (problems === 0) {
    console.log(`brand-check: OK — ${files.length} assets match the authored mark (SC-008/SC-009).`)
    return
  }

  console.error("brand-check: FAILED — committed brand assets do not match the authored mark.\n")
  const report = (label, list) => {
    if (!list.length) return
    console.error(`  ${label}:`)
    // Grouped by surface, so the failure names which surface is stale.
    const bySurface = new Map()
    for (const f of list) {
      const s = typeof f === "string" ? f.split("/")[1] : f.surface
      const p = typeof f === "string" ? f : f.path
      if (!bySurface.has(s)) bySurface.set(s, [])
      bySurface.get(s).push(p)
    }
    for (const [s, paths] of [...bySurface].sort()) {
      console.error(`    ${s}`)
      for (const p of paths.sort()) console.error(`      ${p}`)
    }
  }
  report("STALE (content differs)", stale)
  report("MISSING (declared but not on disk)", missing)
  report("ORPHANED (on disk but declared by no target)", orphans)
  if (manifestStale) console.error("  MANIFEST: assets.manifest.json is stale or absent")

  console.error("\n  Fix: run `make brand-gen`, then commit the result.")
  console.error("  Assets are GENERATED, never hand-edited — see packages/brand/README.md.")
  process.exit(1)
}

main().catch((e) => {
  console.error(`brand-check FAILED — ${e.message}`)
  process.exit(1)
})
