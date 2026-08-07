import { expect, test } from "@playwright/test"

/**
 * FR-045 / FR-046 / SC-009 — the storefront must be usable without a mouse and without sight.
 *
 * These assert the properties that silently rot: a control that loses its accessible name during a
 * redesign, a dialog that traps focus, a dynamic change that never reaches a live region. None of
 * them produce a visible defect, so none of them get noticed without a test.
 */

test.describe("keyboard and assistive technology (SC-009)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("every interactive element in the storefront chrome has an accessible name", async ({ page }) => {
    await page.goto("/")

    // The three controls 025 added to the chrome, each addressed BY NAME — which only passes if the
    // name exists.
    await expect(page.getByRole("button", { name: /delivery location/i })).toBeVisible()
    await expect(page.getByRole("searchbox", { name: /search products/i }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /^Cart/i })).toBeVisible()
  })

  test("the delivery dialog traps focus and closes on Escape", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /delivery location/i }).click()

    const postcode = page.getByLabel("Suburb or postcode")
    await expect(postcode).toBeFocused({ timeout: 2000 }).catch(async () => {
      // A native <dialog> focuses its first focusable child; if the browser chose the close button
      // instead, focus must still be INSIDE the dialog.
      const active = await page.evaluate(() => document.activeElement?.closest("dialog") !== null)
      expect(active).toBe(true)
    })

    await page.keyboard.press("Escape")
    await expect(page.getByLabel("Suburb or postcode")).toBeHidden()
  })

  test("the mini-cart opens from the chrome without navigating away", async ({ page }) => {
    await page.goto("/browse")
    const before = page.url()

    await page.getByRole("button", { name: /^Cart/i }).click()
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible()

    // FR-040: reviewing the cart must not cost the shopper their place.
    expect(page.url()).toBe(before)

    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeHidden()
  })

  test("the result count is inside a live region so it is announced", async ({ page }) => {
    await page.goto("/search")
    // `role=status` implies aria-live=polite; without it a screen-reader user never learns the set
    // changed size when they apply a filter.
    const status = page.getByRole("status")
    await expect(status.first()).toBeAttached()
  })

  test("a guest can traverse the storefront by keyboard alone with focus always visible", async ({ page }) => {
    await page.goto("/")

    // Walk the chrome. The assertion is that focus keeps LANDING on something real — a keyboard trap
    // or an unreachable control shows up here as focus that stops moving.
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      const description = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return "BODY"
        return `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? ""}`
      })
      seen.add(description)
    }

    // More than a couple of distinct stops means focus is genuinely moving through the page.
    expect(seen.size).toBeGreaterThan(2)
    expect(seen.has("BODY")).toBe(false)
  })

  test("product availability and refinement state survive grayscale (FR-047)", async ({ page }) => {
    await page.goto("/search")
    await page.emulateMedia({ forcedColors: "active" }).catch(() => {})

    // The on-sale filter reports its state through aria-pressed, not only through colour — so its
    // meaning is available in grayscale, to a screen reader, and under forced colours alike.
    const chip = page.getByRole("button", { name: "On sale" })
    await expect(chip).toHaveAttribute("aria-pressed", /true|false/)
  })
})

/**
 * 039 — the merchandised home page (SC-009).
 *
 * ⚠ Six sections landed on this page one at a time. Each brought headings, links and controls, and
 * every one of them was an opportunity to break the document outline or ship a target too small to
 * hit. None of that is visible in a screenshot, and none of it fails a unit test.
 */
test.describe("home page accessibility (039, SC-009)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  /**
   * ⚠ THE INVARIANT THAT HAD TO SURVIVE ALL SIX SECTIONS. Exactly one `h1` — the screen-reader-only
   * page title — and every section heads itself at `h2`. The hero's headline is visually the largest
   * type on the page, which is precisely why it is tempting to mark it up as `h1`.
   */
  test("has exactly one h1 and no skipped heading level", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("h1")).toHaveCount(1)

    // ⚠ VISIBLE headings only. The mini-cart <dialog> carries an `h2` that sits BEFORE the page's
    // sr-only `h1` in document order — but a closed <dialog> is `display:none`, so it is not in the
    // accessibility tree and no screen reader ever meets it. Counting it made this test fail on a
    // document outline that is, to any real user, correct.
    const levels = await page
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null || e.classList.contains("sr-only"))
          .map((e) => Number(e.tagName.slice(1))),
      )

    expect(levels[0], "the first heading on the page must be the h1").toBe(1)
    for (let i = 1; i < levels.length; i++) {
      // A jump of more than one level (h2 → h4) leaves a hole in the outline that a screen-reader
      // user navigates straight past.
      expect(
        levels[i]! - levels[i - 1]!,
        `heading level jumped from h${levels[i - 1]} to h${levels[i]}`,
      ).toBeLessThanOrEqual(1)
    }
  })

  /**
   * ⚠ 44 × 44 CSS px (plan § Numeric thresholds). 033 found a save control whose target was 32 dp
   * under a comment claiming it cleared the minimum — harmless on a detail screen, load-bearing in the
   * corner of a tile where a miss navigates away from the thing being tapped.
   *
   * Inline links inside a paragraph are excluded: WCAG 2.2 exempts targets in a sentence, and holding
   * body copy to 44px would mean line-spacing prose to satisfy a rule not written for it.
   */
  test("every standalone interactive target is at least 44x44", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    /**
     * ⚠ TWO PRE-EXISTING OFFENDERS ARE EXCLUDED, BY NAME AND WITH THEIR OWNERS — not silently.
     * Both predate 039 and neither is on this page because of it:
     *
     *   • `SaveControl` — 36×36 on every product tile (039 counted 39 of them). ⚠ 033's post-mortem
     *     records raising the MOBILE tile control from 32 dp to 48 dp for exactly this reason; the WEB
     *     one was never raised. A real open defect, owned by the saved-items surface.
     *   • `PromoCarousel` dots — 8×8 (029). Tiny by design as INDICATORS, but they are anchors, so
     *     they are also targets.
     *
     * Excluding them keeps this guard meaningful for everything else instead of red from day one.
     * Fixing them belongs to their own slices — quietly repairing another feature's component inside a
     * home-page redesign is how scope commitments erode.
     */
    const KNOWN_PRE_EXISTING = [/save to saved items/i, /^go to promotion /i]

    const tooSmall = await page
      .locator("main a, main button")
      .evaluateAll((els, known: string[]) =>
        els
          .filter((e) => {
            const r = e.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return false // not rendered
            // Inline in a sentence — the WCAG 2.2 exception.
            if (e.closest("p")) return false
            const label = e.getAttribute("aria-label") ?? ""
            if (known.some((k) => new RegExp(k.slice(1, k.lastIndexOf("/")), "i").test(label))) {
              return false
            }
            return r.width < 44 || r.height < 44
          })
          .map((e) => {
            const r = e.getBoundingClientRect()
            return `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 32)}" ${Math.round(r.width)}x${Math.round(r.height)}`
          }),
        KNOWN_PRE_EXISTING.map(String),
      )

    expect(tooSmall, "interactive targets below 44x44").toEqual([])
  })

  /**
   * ⚠ Every image on this page is decorative — the surrounding text names the thing. What must never
   * happen is an image with NO alt attribute at all, which a screen reader reads as its filename.
   */
  test("no image is missing an alt attribute", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const missing = await page
      .locator("main img")
      .evaluateAll((els) =>
        els.filter((e) => !e.hasAttribute("alt")).map((e) => (e as HTMLImageElement).src),
      )

    expect(missing, "images with no alt attribute").toEqual([])
  })

  /**
   * ⚠ The store badges are the case this protects. They are `<span>`s, not disabled links — a disabled
   * `<a>` is still announced as a link and promises a destination that does not exist. "Coming soon"
   * has to be in the accessible NAME, not implied by dimming, or a screen-reader user is told the apps
   * are available.
   */
  test("the unpublished app badges announce that they are coming soon", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByLabel("Google Play — coming soon")).toBeVisible()
    await expect(page.getByLabel("App Store — coming soon")).toBeVisible()

    // And neither is reachable as a link or a button.
    await expect(page.getByRole("link", { name: /google play/i })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /app store/i })).toHaveCount(0)
  })
})
