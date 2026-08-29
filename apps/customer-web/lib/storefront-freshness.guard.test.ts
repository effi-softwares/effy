import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * ⚠ THE GUARD FOR 054 FR-015a — STOREFRONT READS MUST STAY LIVE.
 *
 * Stock is the one thing on a product page that another shopper, or a paid order, can change from
 * under the person looking at it. Availability must therefore be current: listings within 60s, the
 * product page immediately, cart and checkout authoritative.
 *
 * ⚠ TODAY THAT HOLDS FOR FREE, and the research pass had to correct its own premise to discover it:
 * every storefront read already passes `uncached()`, and the `cached()` helper — documented, exported,
 * recommended in its own doc comment — has ZERO call sites on any storefront route. The static shell
 * is a PPR property (the shell prerenders, the data is fetched live inside <Suspense>), not a
 * data-caching one.
 *
 * So this guards a risk the feature INTRODUCES rather than a defect it fixes: a later performance
 * pass adds `cached({ tags: ["catalog"], revalidate: 3600 })` to a listing read, and sold-out
 * products silently look buyable for an hour. Nothing would fail. Nothing would look wrong.
 *
 * ⚠ `customer-mobile` needs no equivalent: it calls core-api directly with no cache layer at all.
 * Recorded here so the omission is a decision rather than something nobody thought about.
 */

const root = resolve(import.meta.dirname, "..")

/** The public storefront — everything a shopper browses before signing in. */
const STOREFRONT = join(root, "app", "(shop)")

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* files(full)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
  }
}

describe("storefront reads stay live enough for stock to be true (054 FR-015a)", () => {
  it("uses no cached() read anywhere under app/(shop)", () => {
    const offences: string[] = []

    for (const file of files(STOREFRONT)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // `cached(` as a CALL, not the word in prose.
          if (/\bcached\s*\(\s*\{/.test(line)) {
            offences.push(`${file.slice(root.length + 1)}:${i + 1}  ${line.trim()}`)
          }
        })
    }

    expect(
      offences,
      `A storefront read acquired cached(). Stock changes must reach a shopper within 60 seconds ` +
        `(FR-015a) — a cached listing shows sold-out products as buyable for the whole revalidate ` +
        `window, and nothing fails when it does. If the caching is genuinely wanted, pair it with ` +
        `tag invalidation on every stock write and update FR-015a first:\n\n  ${offences.join("\n  ")}\n`,
    ).toEqual([])
  })

  it("is actually reading the storefront — a guard that scans nothing always passes", () => {
    const found = [...files(STOREFRONT)]
    expect(found.length).toBeGreaterThan(10)
    expect(found.some((f) => f.includes("product"))).toBe(true)
  })

  it("confirms those reads are explicitly uncached rather than merely un-annotated", () => {
    // The distinction matters: an un-annotated fetch inherits Next's default, which has changed
    // between major versions. `uncached()` is a decision the file states.
    const productPage = readFileSync(join(STOREFRONT, "product", "[id]", "page.tsx"), "utf8")
    expect(productPage).toContain("uncached()")
  })
})
