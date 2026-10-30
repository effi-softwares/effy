import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A screen that is still reading is drawn with `@effy/web-kit/patterns`' loading shapes - `DetailPageSkeleton`,
 * `PanelSkeleton`, `DetailRowsSkeleton`, `TableSkeleton`, a table's own `loading` - which are built from the same
 * components as the loaded page, so the shape cannot drift from it. A raw `Skeleton` slab, a "Loading…" sentence
 * or `aria-busy` written by hand is how the old placeholders stopped matching their pages.
 */
const SRC = resolve(__dirname, "..")
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const files = walk(SRC).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
const read = (f: string) => readFileSync(f, "utf8")
const importsUi = (s: string, name: string) =>
  [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@effy\/design-system\/ui"/g)].some((m) =>
    new RegExp(`\\b${name}\\b`).test(m[1]!),
  )

describe("loading screens use the one skeleton kit", () => {
  it("no screen draws the raw Skeleton", () => {
    expect(files.filter((f) => importsUi(read(f), "Skeleton")).map((f) => relative(SRC, f))).toEqual([])
  })

  it("no screen says Loading… instead of showing the page's shape", () => {
    expect(files.filter((f) => />\s*Loading(…|\.\.\.)[^<]*</.test(read(f))).map((f) => relative(SRC, f))).toEqual([])
  })

  it("no screen marks itself busy by hand (Loading does it)", () => {
    expect(files.filter((f) => /aria-busy="true"/.test(read(f))).map((f) => relative(SRC, f))).toEqual([])
  })
})
