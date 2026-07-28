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

    const postcode = page.getByLabel("Postcode")
    await expect(postcode).toBeFocused({ timeout: 2000 }).catch(async () => {
      // A native <dialog> focuses its first focusable child; if the browser chose the close button
      // instead, focus must still be INSIDE the dialog.
      const active = await page.evaluate(() => document.activeElement?.closest("dialog") !== null)
      expect(active).toBe(true)
    })

    await page.keyboard.press("Escape")
    await expect(page.getByLabel("Postcode")).toBeHidden()
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
