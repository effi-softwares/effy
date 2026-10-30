import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { CACHE_LIFE } from "./cache-life"

/**
 * What a storefront read may cache, and for how long. Availability must be current: listings within 60s,
 * the product page immediately, cart and checkout authoritative. A stock-derived read may be kept 60
 * seconds; a product's words and pictures (never price or availability) longer.
 *
 * An allow-list: each cached read is named with its one lifetime, and a new `"use cache"` fails here
 * until someone says which tier it is, because a listing cached for an hour sells sold-out products and
 * nothing else fails. No cached read has an invalidating writer (lib/cache-life.ts).
 */

const root = resolve(import.meta.dirname, "..")

/** Every file that may hold a `"use cache"` read → the `CACHE_LIFE` lifetimes it may name. */
const ALLOWED: Record<string, readonly (keyof typeof CACHE_LIFE)[]> = {
  "lib/categories.ts": ["listing"],
  "app/(shop)/home-data.ts": ["listing"],
  // Display groups for a signed-out shopper: the same listing tier as the banners they replaced.
  "app/(shop)/promotion-groups-public.ts": ["listing"],
  // `listing` for a 404, and for content still carrying a presigned (15-minute) picture address.
  "app/(shop)/product/[id]/page.tsx": ["catalogue", "listing"],
}

/**
 * Every file that may use the fetch-level `cached` option. The order rules are identical for every
 * shopper and carry no stock - nothing a 5-minute-old copy can make untrue at the payment gate, which
 * re-reads them.
 */
const ALLOWED_FETCH_CACHE = ["app/api/cart/policy/route.ts"]

/** The lifetime a stock-derived read may take: FR-015a's listing tier. */
const LISTING_LIMIT_SECONDS = 60

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* files(full)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
  }
}

const sources = ["app", "components", "lib"].flatMap((d) => [...files(join(root, d))])
const rel = (file: string) => file.slice(root.length + 1)

/** The directive as a statement - not the phrase in prose. */
const USE_CACHE = /^\s*["']use cache(?::[a-z]+)?["'];?\s*$/m

describe("storefront reads keep only what FR-015a allows (054)", () => {
  it("caches only in the allow-listed files", () => {
    const offences = sources.filter((f) => USE_CACHE.test(readFileSync(f, "utf8"))).map(rel)
    expect(
      offences.filter((f) => !(f in ALLOWED)),
      `A read acquired "use cache". Stock changes must reach a shopper within 60 seconds and the ` +
      `product page at once (FR-015a). Add the file to ALLOWED with the profile it takes - and ` +
      `only after FR-015a says it may be kept that long.`,
    ).toEqual([])
  })

  it("uses the fetch-level cached() option only where allowed", () => {
    const offences = sources
      .filter((f) => /\bcached\s*\(\s*\{/.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((f) => !ALLOWED_FETCH_CACHE.includes(f))
    expect(offences, "A read acquired cached() - the same rule as \"use cache\" applies").toEqual([])
  })

  it("every allow-listed file still caches, and names only its own profiles", () => {
    for (const [file, profiles] of Object.entries(ALLOWED)) {
      const src = readFileSync(join(root, file), "utf8")
      expect(USE_CACHE.test(src), `${file} is allow-listed but no longer caches - drop it`).toBe(true)
      const named = [...src.matchAll(/cacheLife\(([^)]*)\)/g)].flatMap((m) =>
        [...m[1]!.matchAll(/CACHE_LIFE\.([a-z]+)/g)].map((n) => n[1]!),
      )
      expect(named.length, `${file}: a cached read with no cacheLife takes Next's default (15 minutes)`).toBeGreaterThan(0)
      expect(new Set(named), file).toEqual(new Set(profiles))
    }
  })

  it("every cached read is reached only at request time, so a build never makes it", () => {
    // Shared reads await connection before the cached call. The product page's read needs no
    // marker: it is keyed by the product id, which only exists at request time (`await params`).
    // See lib/cache-life.ts for the build this broke.
    for (const file of Object.keys(ALLOWED)) {
      const src = readFileSync(join(root, file), "utf8")
      if (file.includes("[id]")) expect(src, file).toMatch(/const \{ id \} = await params/)
      else expect(src, file).toMatch(/await connection\(\)/)
    }
  })

  it("no cached read is per-customer", () => {
    for (const file of Object.keys(ALLOWED)) {
      const src = readFileSync(join(root, file), "utf8")
      expect(src, file).not.toMatch(/edgeApi\(|getSession|cookies\(|headers\(/)
    }
  })

  it("the listing profile is never shown more than 60 seconds late", () => {
    // `expire` is the oldest the server serves; the browser's router then keeps it for `stale`.
    const { stale, revalidate, expire } = CACHE_LIFE.listing
    expect(stale + expire).toBeLessThanOrEqual(LISTING_LIMIT_SECONDS)
    expect(expire).toBeGreaterThan(revalidate) // Next refuses a profile otherwise
  })

  it("the catalogue profile keeps no picture link past its life", () => {
    // A presigned address lives 15 minutes; content still carrying one is kept as a listing instead,
    // but a catalogue entry outliving one would be a broken gallery if that branch were ever lost.
    const { expire } = CACHE_LIFE.catalogue
    expect(expire).toBeLessThanOrEqual(15 * 60)
  })

  it("the product page reads price and availability live", () => {
    const page = readFileSync(join(root, "app", "(shop)", "product", "[id]", "page.tsx"), "utf8")
    // The kept content has the live fields stripped before it is returned (094 added the offer; 098
    // the sizes, each with its own price and availability)…
    const live = /const LIVE_FIELDS = \[([^\]]*)\]/.exec(page)?.[1] ?? ""
    for (const f of ["priceAmount", "compareAtAmount", "currency", "available", "badges", "offer", "variants", "options", "defaultVariantId", "unitPrice", "priceVaries"]) {
      expect(live).toContain(`"${f}"`)
    }
    expect(page).toMatch(/for \(const k of LIVE_FIELDS\) delete kept\[k\]/)
    // …and the live read beside it is the product read, uncached.
    expect(page).toMatch(/products\/\$\{encodeURIComponent\(id\)\}`, uncached\(\)/)
  })

  it("is actually reading the storefront - a guard that scans nothing always passes", () => {
    expect(sources.length).toBeGreaterThan(50)
    expect(sources.some((f) => f.includes("product"))).toBe(true)
  })
})
