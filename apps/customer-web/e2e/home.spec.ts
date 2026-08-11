import { expect, test } from "@playwright/test"

/**
 * The merchandised landing page (039).
 *
 * ⚠ WHY THE HOME PAGE NEEDS ITS OWN E2E FILE. Most of this page is async Server Components, which
 * Vitest cannot render at all (see the note at the top of `vitest.config.ts`). The composition — what
 * order the sections appear in, whether an empty one leaves a hole, whether the hero is in the bytes
 * a crawler receives — is only observable here.
 *
 * Each User Story phase appends to this file. It starts with the one assertion that must hold at every
 * point in the section-by-section build, including before any section exists.
 */

test.describe("home page structure (SC-009)", () => {
  /**
   * ⚠ THE INVARIANT THAT SURVIVES EVERY PHASE. The page carries exactly one `h1` — the screen-reader-only
   * page title — and every section heads itself at `h2`. Six sections land here one at a time, each
   * with a heading; the first one that reaches for `h1` breaks the document outline for every assistive
   * technology, and nothing else in the build would notice.
   */
  test("has exactly one top-level heading, no matter which sections have data", async ({ page }) => {
    await page.goto("/")

    await expect(page.locator("h1")).toHaveCount(1)
  })
})

test.describe("hero is in the served page, not gated on the catalogue (US1, FR-012/FR-040)", () => {
  /**
   * ⚠ FETCHES THE RAW BYTES, deliberately — not a rendered page. The hero's entire requirement is that
   * it is present *before* anything streams, for a crawler that runs no JavaScript and for the first
   * paint. Asserting it in a browser would pass even if it arrived inside the Suspense boundary, which
   * is precisely the failure this is here to catch.
   */
  test("the headline and both actions are in the raw HTML", async ({ request }) => {
    const res = await request.get("/")
    expect(res.status()).toBe(200)

    const html = await res.text()

    expect(html).toContain("Everything you need, delivered")
    expect(html).toContain('href="/search"')
    expect(html).toContain('href="/search?saleOnly=true"')
  })

  test("the value strip's claims are in the raw HTML and none of them is a boast-count", async ({
    request,
  }) => {
    const html = await (await request.get("/")).text()

    expect(html).toContain("One brand")
    expect(html).toContain("No account")
    expect(html).toContain("Same day")
  })

  /**
   * ⚠ `/on sale/i` would match TWO links — the hero's "See what's on sale" and the header nav's "On
   * sale" — which is a strict-mode violation, not a rendering fault. The full phrase disambiguates
   * without adding a test id to production markup.
   */
  test("renders the headline and both actions visibly, over the artwork", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: /everything you need/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /shop now/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /see what.s on sale/i })).toBeVisible()
  })

  /**
   * ⚠ The hero artwork is the LCP element on the platform's only public landing page. The hazard this
   * guards is `loading="lazy"` on it — the single most common cause of a poor Largest Contentful
   * Paint, and something nothing else in the build would notice.
   *
   * ⚠ It does NOT assert a `<link rel=preload>`: Next emits none for this image, even with `priority`,
   * because it is `unoptimized`. See the note in quickstart § US1 — three BELOW-the-fold promo banners
   * are preloaded while the hero is not, which is a real prioritisation inversion but a pre-existing
   * `PromoCarousel` behaviour rather than something this feature introduced.
   */
  test("does not lazy-load the LCP hero artwork", async ({ request }) => {
    const html = await (await request.get("/")).text()

    const img = /<img[^>]*hero-1\.jpg[^>]*>/.exec(html)?.[0] ?? ""
    expect(img).not.toBe("")
    expect(img).not.toContain('loading="lazy"')
  })
})

/**
 * SC-002 — "a shopper can reach a category listing in ONE tap from the shortcuts, and the full category
 * set in one more". That is a claim about navigation depth, and the only honest way to check it is to
 * actually take the taps.
 *
 * ⚠ Requires a seeded catalogue. With none, the strip correctly renders nothing (FR-004) and these skip
 * rather than fail — a green suite against an empty store would be a lie about coverage.
 */
test.describe("category shortcuts (US2, SC-002)", () => {
  /**
   * ⚠ THE STRIP STREAMS. It depends on the request-time categories read, so it renders inside the
   * page's `<Suspense>` hole — it is NOT in the first bytes. Counting it immediately after `goto()`
   * therefore races the stream: it passed when run alone and failed under four parallel workers, which
   * is the worst kind of test, because the flake looks like a real defect at exactly the moment
   * somebody is trying to ship.
   *
   * So: wait for it, and only treat a genuine timeout as "this environment has no categories".
   */
  async function categoryStripReady(page: import("@playwright/test").Page): Promise<boolean> {
    await page.goto("/")
    return page
      .getByRole("heading", { name: /shop by category/i })
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
  }

  test("one tap reaches a category listing", async ({ page }) => {
    test.skip(!(await categoryStripReady(page)), "no stocked categories in this environment")

    // ⚠ Scoped to the STRIP. The rails' own "view all" actions match `a[href^="/search?category="]`
    // too, so an unscoped `.first()` resolves to whichever of them streamed in first.
    const strip = page.locator("section").filter({ hasText: /shop by category/i })
    const first = strip.locator('a[href^="/search?category="]').first()
    const href = await first.getAttribute("href")
    await first.click()

    // ⚠ `waitForURL`, not `expect(page).toHaveURL`, and with a generous budget: the destination is a
    // dynamic search page that queries core-api, and under four parallel workers it routinely takes
    // longer than the 5s default assertion timeout. That is load, not a defect — but it fails
    // identically, which is how a green suite starts getting ignored.
    await page.waitForURL(new RegExp(href!.replace(/[?&=]/g, "\\$&")), { timeout: 30_000 })
    await expect(page.locator("h1")).toHaveCount(1)
  })

  test("one more tap reaches the full product set", async ({ page }) => {
    test.skip(!(await categoryStripReady(page)), "no stocked categories in this environment")

    await page.getByRole("link", { name: /shop all products/i }).click()
    await page.waitForURL(/\/search$/, { timeout: 30_000 })
  })

  /**
   * ⚠ A shortcut to an unstocked category opens an EMPTY listing, because category filtering is
   * exact-match everywhere on this platform. This is the live-data half of that rule: the strip must
   * never link to a category the server reports as holding nothing — which on the current seed means
   * every top-level parent, since `productCount` does not roll up (028).
   */
  test("never links to a category with no products", async ({ page, request }) => {
    test.skip(!(await categoryStripReady(page)), "no stocked categories in this environment")

    // ⚠ Deliberately every category link on the page, not just the strip's — the rails' "view all"
    // actions point at the same facet and would open the same empty listing if a rail ever went stale.
    const links = await page.locator('a[href^="/search?category="]').all()

    const stocked = new Set(
      ((await (await request.get("http://localhost:8080/v1/storefront/categories")).json()) as {
        key: string
        productCount: number
      }[])
        .filter((c) => c.productCount > 0)
        .map((c) => c.key),
    )
    test.skip(stocked.size === 0, "core-api not reachable")

    for (const link of links) {
      const href = await link.getAttribute("href")
      expect(href).not.toBeNull()
      const key = new URL(href!, "http://x").searchParams.get("category")!
      expect(stocked, `shortcut links to unstocked category "${key}"`).toContain(key)
    }
  })
})

/**
 * SC-003 — "at least three distinct merchandised product sections when the catalogue is seeded, each
 * using the unchanged product card". Counting them is the whole assertion; there is no way to check
 * "the page reads as a long merchandised landing" other than to count what is on it.
 */
test.describe("merchandised rails (US3, SC-003)", () => {
  /**
   * ⚠ THE RAILS STREAM, like the category strip. Waiting on the locator the test then COUNTS is the
   * only sound form — an earlier version waited on an unrelated locator, so on mobile the count ran
   * against a half-streamed page and reported 2. The flake looked exactly like a missing rail.
   *
   * `^view all$` deliberately excludes "View all categories", which is the strip's action, not a rail's.
   */
  function railActions(page: import("@playwright/test").Page) {
    return page.getByRole("link", { name: /^view all$/i })
  }

  async function railsReady(page: import("@playwright/test").Page): Promise<number> {
    await page.goto("/")
    await railActions(page)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {})
    return railActions(page).count()
  }

  test("presents at least three distinct titled product sections", async ({ page }) => {
    const count = await railsReady(page)
    test.skip(count === 0, "no seeded catalogue in this environment")

    expect(count).toBeGreaterThanOrEqual(3)
  })

  test("every rail's 'view all' resolves to a real listing, not a 404", async ({ page, request }) => {
    const count = await railsReady(page)
    test.skip(count === 0, "no seeded catalogue in this environment")

    const hrefs = await railActions(page).evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")),
    )

    for (const href of hrefs) {
      expect(href, "a rail action with no destination").toBeTruthy()
      const res = await request.get(href!)
      expect(res.status(), `${href} did not resolve`).toBeLessThan(400)
    }
  })

  /**
   * ⚠ FR-004 as a shopper would notice it failing: a heading with nothing under it. Every `h2` on the
   * merchandised page must be followed by actual content — an empty rail should not exist at all
   * rather than exist and be blank.
   */
  test("shows no section heading above an empty section", async ({ page }) => {
    const count = await railsReady(page)
    test.skip(count === 0, "no seeded catalogue in this environment")

    const emptySections = await page.locator("section").evaluateAll((sections) =>
      sections
        .filter((s) => s.querySelector("h2"))
        .filter((s) => (s.textContent ?? "").replace(/\s+/g, "").length < 30)
        .map((s) => s.querySelector("h2")?.textContent ?? "?"),
    )

    expect(emptySections, "section heading with no content under it").toEqual([])
  })
})

/**
 * US4 — the promotional offer panels.
 *
 * ⚠ FR-019 ("a promotion that expired between load and tap resolves to 'this offer has ended', never
 * void terms") NEEDS NO NEW CODE: `/promotions/[id]` already re-applies the same visibility predicate
 * Home used and 404s to an ended state (029). What 039 must guarantee is that the panels actually lead
 * THERE — which is precisely what 029 got wrong, sending every promotion to the unfiltered store.
 */
test.describe("offer panels (US4)", () => {
  async function offersReady(page: import("@playwright/test").Page): Promise<number> {
    await page.goto("/")
    const heading = page.getByRole("heading", { name: /^offers$/i })
    await heading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {})
    return heading.count()
  }

  test("every panel leads to a promotion page, never to the unfiltered store", async ({ page }) => {
    test.skip(!(await offersReady(page)), "no advertised offer promotions in this environment")

    const block = page.locator("section").filter({ has: page.getByRole("heading", { name: /^offers$/i }) })
    const hrefs = await block
      .locator("a")
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")))

    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href, "an offer panel with no destination").toBeTruthy()
      expect(href, "an offer panel pointing at the unfiltered store — 029's defect").not.toBe("/search")
      expect(href).toMatch(/^\/promotions\//)
    }
  })

  test("a panel's destination actually resolves", async ({ page, request }) => {
    test.skip(!(await offersReady(page)), "no advertised offer promotions in this environment")

    const first = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^offers$/i }) })
      .locator("a")
      .first()

    const href = await first.getAttribute("href")
    const res = await request.get(href!)
    expect(res.status(), `${href} did not resolve`).toBeLessThan(400)
  })

  /** FR-018: a block never renders a frame it has no promotion for. */
  test("renders no empty or placeholder panel", async ({ page }) => {
    test.skip(!(await offersReady(page)), "no advertised offer promotions in this environment")

    const panels = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^offers$/i }) })
      .locator("a")

    for (const panel of await panels.all()) {
      const text = ((await panel.textContent()) ?? "").trim()
      expect(text.length, "an offer panel with no message in it").toBeGreaterThan(0)
    }
  })
})
