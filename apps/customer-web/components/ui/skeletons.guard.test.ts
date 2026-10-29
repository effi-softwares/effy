import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A storefront page that is still reading shows its own structure, drawn from `@/components/ui/skeletons`
 * (each component's own skeleton beside it where it has one). A hand-rolled grey slab (`animate-pulse`
 * with `bg-muted`), a "Loading…" sentence, or a Suspense boundary whose fallback is a bare `div` is how the
 * old placeholders came to look nothing like their pages.
 */
const root = resolve(import.meta.dirname, "../..")
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    if (f === "node_modules" || f === ".next") return []
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const files = ["app", "components"]
  .flatMap((d) => walk(join(root, d)))
  .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
const read = (f: string) => readFileSync(f, "utf8")
const named = (pred: (s: string) => boolean) => files.filter((f) => pred(read(f))).map((f) => relative(root, f))

describe("storefront loading shapes come from the one kit", () => {
  it("no screen draws its own pulsing slab", () => {
    expect(named((s) => /animate-pulse[^"]*bg-muted|bg-muted[^"]*animate-pulse/.test(s))).toEqual([])
  })

  it("no screen says Loading… instead of showing the page's shape", () => {
    expect(named((s) => />\s*Loading[^<]*(…|\.\.\.)\s*</.test(s))).toEqual([])
  })

  it("no Suspense fallback is a bare box", () => {
    expect(named((s) => /fallback=\{<div className=/.test(s))).toEqual([])
  })
})
