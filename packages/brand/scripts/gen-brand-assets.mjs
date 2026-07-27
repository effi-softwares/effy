// GENERATOR — the ONE thing allowed to produce a brand asset (024 FR-003).
//
// Same shape as design-system's gen-compose-theme.mjs: an authored source, COMMITTED derived
// artifacts, and a check that fails when they diverge. Assets are committed rather than built on
// demand because Xcode asset catalogs, Gradle resource merging and Next's file-convention metadata
// all read files from disk during their OWN build, and a mobile build cannot reach into the pnpm
// workspace.
//
// Determinism is a hard requirement (SC-009): two runs on unchanged input MUST produce byte-identical
// output, because the drift check compares hashes. Nothing here may embed a timestamp, an absolute
// path, a machine name or an iteration order that is not explicitly sorted.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, resolve, relative, join } from "node:path"
import { fileURLToPath } from "node:url"

import { COLOURWAYS, mono } from "../src/colourways.mjs"
import { composition, splashGroundFor } from "../src/compositions.mjs"
import { TARGETS, KIND } from "../src/targets.mjs"
import { composeSvg } from "./lib/compose.mjs"
import { measureBBox, renderWithAlphaPolicy, renderPng } from "./lib/raster.mjs"
import { buildIco } from "./lib/ico.mjs"
import { toVectorDrawable, solidVectorDrawable } from "./lib/vector-drawable.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(here, "..")
const REPO = resolve(PKG, "../..")
const MARK = resolve(PKG, "src/logo.svg")
const MANIFEST = resolve(PKG, "assets.manifest.json")

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")

/** Resolve a target's colourway, honouring the `mono` derivation. */
function colourwayFor(target) {
  if (target.mono) return mono(target.mono)
  const cw = COLOURWAYS[target.colourway]
  if (!cw) throw new Error(`unknown colourway '${target.colourway}' for ${target.path}`)
  return cw
}

/** Produce every byte for one target. Returns [{ path, bytes }]. */
async function buildTarget(target, mark, bbox) {
  const cw = colourwayFor(target)
  const comp = composition(target.composition)
  const svg = composeSvg(mark, bbox, cw, comp)

  switch (target.kind) {
    case KIND.SVG:
      return [{ path: target.path, bytes: Buffer.from(svg + "\n", "utf8") }]

    case KIND.PNG: {
      const size = target.sizes[0]
      return [{ path: target.path, bytes: await renderWithAlphaPolicy(svg, size, comp.alpha) }]
    }

    case KIND.ICO: {
      const entries = target.sizes.map((size) => ({ size, png: renderPng(svg, size) }))
      return [{ path: target.path, bytes: buildIco(entries) }]
    }

    case KIND.VD:
      return [{ path: target.path, bytes: Buffer.from(toVectorDrawable(svg, target.sizeDp), "utf8") }]

    case KIND.VD_SOLID:
      return [
        { path: target.path, bytes: Buffer.from(solidVectorDrawable(target.solid, target.sizeDp), "utf8") },
      ]

    default:
      throw new Error(`unknown kind '${target.kind}' for ${target.path}`)
  }
}

/**
 * `#rrggbb` → the component form an Xcode `.colorset` wants. Xcode accepts several notations; the
 * uppercase `0xNN` byte form is the one Xcode itself writes, so a hand-edit in Xcode round-trips to
 * the same bytes the generator produces and `brand:check` stays quiet.
 */
function xcodeComponents(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) throw new Error(`splash ground must be #rrggbb, got '${hex}'`)
  const byte = (i) => "0x" + m[1].slice(i * 2, i * 2 + 2).toUpperCase()
  return { alpha: "1.000", blue: byte(2), green: byte(1), red: byte(0) }
}

/**
 * Asset-catalog sidecars. Xcode will not see an imageset without a Contents.json, so these are part
 * of the delivered asset, not incidental scaffolding — which means they belong in the manifest too
 * (rule M1), or the drift check would treat them as orphans.
 */
function sidecars() {
  const out = []
  for (const app of ["customer-mobile", "shop-mobile"]) {
    const base = `apps/${app}/iosApp/iosApp/Assets.xcassets`
    out.push({
      path: `${base}/LaunchLogo.imageset/Contents.json`,
      bytes: Buffer.from(
        JSON.stringify(
          {
            images: [
              { filename: "launch-logo.png", idiom: "universal", scale: "1x" },
              { filename: "launch-logo@2x.png", idiom: "universal", scale: "2x" },
              { filename: "launch-logo@3x.png", idiom: "universal", scale: "3x" },
            ],
            info: { author: "effy-brand", version: 1 },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      ),
    })
    // ⚠ Both appearances carry the SAME value. The splash ground is a brand colour now (024
    // amendment 2026-07-27), and a saturated ground has no light/dark variant — dropping the dark
    // entry entirely would let iOS fall back to a system colour, so it is declared explicitly.
    const ground = xcodeComponents(splashGroundFor(app))
    out.push({
      path: `${base}/LaunchBackground.colorset/Contents.json`,
      bytes: Buffer.from(
        JSON.stringify(
          {
            colors: [
              {
                color: { "color-space": "srgb", components: ground },
                idiom: "universal",
              },
              {
                appearances: [{ appearance: "luminosity", value: "dark" }],
                color: { "color-space": "srgb", components: ground },
                idiom: "universal",
              },
            ],
            info: { author: "effy-brand", version: 1 },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      ),
    })
  }
  return out
}

/** Build the complete asset set in memory. Shared by the generator and the drift check. */
export async function buildAll() {
  const mark = readFileSync(MARK, "utf8")
  // ⚠ RULE V2 — measured, never hard-coded. A stale bbox mis-centres every asset silently.
  const bbox = await measureBBox(mark)

  const files = []
  for (const target of TARGETS) {
    for (const f of await buildTarget(target, mark, bbox)) {
      files.push({ ...f, surface: target.surface, slot: target.slot, target })
    }
  }
  for (const s of sidecars()) {
    files.push({ ...s, surface: s.path.split("/")[1], slot: "asset-catalog-sidecar", target: null })
  }

  // Deterministic ordering — never rely on declaration order for the manifest (rule M4).
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { mark, bbox, files }
}

/** Manifest content. Pure function of the built files — no timestamps, no absolute paths (M4). */
export function buildManifest(mark, files) {
  const pkgJson = JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8"))
  return (
    JSON.stringify(
      {
        $comment:
          "GENERATED by @effy/brand (specs/024-brand-icons-splash). Do not edit — run `make brand-gen`.",
        generatedFrom: {
          mark: "src/logo.svg",
          markSha256: sha256(Buffer.from(mark, "utf8")),
          generator: "scripts/gen-brand-assets.mjs",
          // Exact versions: determinism is only guaranteed within a version pair (research R8).
          // This is the first thing to compare when a check fails on someone else's machine.
          toolchain: {
            resvg: pkgJson.devDependencies["@resvg/resvg-js"],
            sharp: pkgJson.devDependencies["sharp"],
          },
        },
        assets: files.map((f) => ({
          surface: f.surface,
          slot: f.slot,
          path: f.path,
          sha256: sha256(f.bytes),
          bytes: f.bytes.length,
        })),
      },
      null,
      2,
    ) + "\n"
  )
}

async function main() {
  const { mark, bbox, files } = await buildAll()

  // Write to a staging directory first, then move into place — a failure part-way through must not
  // leave the repository with a half-generated asset set.
  const staging = resolve(PKG, ".brand-staging")
  rmSync(staging, { recursive: true, force: true })
  for (const f of files) {
    const dest = join(staging, f.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, f.bytes)
  }

  for (const f of files) {
    const dest = resolve(REPO, f.path)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(staging, f.path), dest)
  }
  rmSync(staging, { recursive: true, force: true })

  writeFileSync(MANIFEST, buildManifest(mark, files))

  const bySurface = new Map()
  for (const f of files) bySurface.set(f.surface, (bySurface.get(f.surface) ?? 0) + 1)
  console.log(
    `brand:gen — ${files.length} assets from src/logo.svg ` +
      `(bbox ${bbox.x},${bbox.y} ${bbox.w}×${bbox.h})`,
  )
  for (const [s, n] of [...bySurface].sort()) console.log(`  ${String(n).padStart(3)}  ${s}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`brand:gen FAILED — ${e.message}`)
    process.exit(1)
  })
}

export { REPO, PKG, MANIFEST, sha256 }
