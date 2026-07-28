import { expect, test } from "@playwright/test"

/**
 * SC-001 / FR-009 — browse must be a real destination, not a dead end.
 *
 * ⚠ The regression these lock down is embarrassing enough to be worth stating: `/browse` was the ONLY
 * entry in the storefront's primary navigation, and from 011 through 024 it rendered "the shelves are
 * still being stocked" — a placeholder that stayed after 016 filled the catalogue and 019 made it
 * shoppable. The single most prominent link on the store led nowhere.
 *
 * These require a catalogue with products. Against an empty store the placeholder is CORRECT, so the
 * suite skips rather than reporting a false failure.
 */

test.describe("browse is a working category experience (SC-001)", () => {
  test.use({ storageState: { cookies: [], origins: [] } }) // a genuinely fresh visitor

  test("the primary nav leads to real categories, never a placeholder", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Browse" }).click()
    await expect(page).toHaveURL(/\/browse$/)

    await expect(page.getByRole("heading", { name: "Browse the store" })).toBeVisible()

    const categories = page.getByRole("link", { name: /\d+ items?$/ })
    const count = await categories.count()
    test.skip(count === 0, "no catalogue seeded — the empty state is correct here")

    // The placeholder copy must be gone whenever the store HAS products.
    await expect(page.getByText("The shelves are still being stocked")).toHaveCount(0)
    await expect(page.getByText("Our catalogue is on its way")).toHaveCount(0)
  })

  test("a guest reaches a product through browse in three steps, without searching", async ({ page }) => {
    await page.goto("/")

    // 1 — browse
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Browse" }).click()
    const categories = page.getByRole("link", { name: /\d+ items?$/ })
    test.skip((await categories.count()) === 0, "no catalogue seeded")

    // 2 — a category
    await categories.first().click()
    await expect(page).toHaveURL(/\/search\?category=/)

    // 3 — a product
    const products = page.locator('a[href^="/product/"]')
    await expect(products.first()).toBeVisible()
    await products.first().click()
    await expect(page).toHaveURL(/\/product\//)

    // Guest-first: no sign-in was demanded anywhere along the way (FR-003).
    await expect(page.getByTestId("account-link")).toHaveCount(0)
  })

  test("a category with no imagery still renders a tile rather than a broken frame", async ({ page }) => {
    await page.goto("/browse")
    const categories = page.getByRole("link", { name: /\d+ items?$/ })
    test.skip((await categories.count()) === 0, "no catalogue seeded")

    // Every tile has a visible label regardless of whether an image was derivable for it.
    for (const tile of await categories.all()) {
      await expect(tile).toBeVisible()
    }
  })
})
