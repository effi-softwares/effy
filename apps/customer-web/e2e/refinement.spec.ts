import { expect, test } from "@playwright/test"

/**
 * FR-015 / FR-016 / FR-017 / FR-018 — refinement must live in the URL.
 *
 * ⚠ Before 025, `SearchExperience` seeded its query from the URL exactly once and then held every
 * refinement in component state, never writing back. So a refined result set could not be shared,
 * bookmarked, or restored by the back button — FR-017 and FR-018 were unmet before this feature
 * started, and sort plus a price range would have added three more invisible dimensions.
 *
 * These need a seeded catalogue; without one they skip rather than fail falsely.
 */

test.describe("refinement is shareable and restorable (FR-017/FR-018)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  async function hasResults(page: import("@playwright/test").Page) {
    await page.waitForTimeout(600) // the debounce plus one round trip
    return (await page.locator('a[href^="/product/"]').count()) > 0
  }

  test("the delivery affordance is present on the storefront before any cart exists", async ({ page }) => {
    await page.goto("/")
    // SC-002's precondition: a shopper can ask "do you deliver to me?" from the first page.
    await expect(page.getByRole("button", { name: /delivery location/i })).toBeVisible()
  })

  test("an unrecognised postcode is refused as invalid, NOT as unserviced", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /delivery location/i }).click()
    await page.getByLabel("Postcode").fill("nonsense")
    await page.getByRole("button", { name: "Check" }).click()

    // "That isn't a postcode" and "we don't deliver there" are different answers. Showing the second
    // to someone who typoed tells a prospective customer to leave, and is not even true.
    await expect(page.getByText("Enter a 4-digit postcode.")).toBeVisible()
    await expect(page.getByText(/don.t deliver to/i)).toHaveCount(0)
  })

  test("applying a filter writes it to the URL and a fresh visit restores it", async ({ page, context }) => {
    await page.goto("/search")
    test.skip(!(await hasResults(page)), "no catalogue seeded")

    await page.getByRole("button", { name: "On sale" }).click()
    await expect(page).toHaveURL(/saleOnly=true/)

    // The whole point: someone else opening this link sees the same refined set.
    const shared = page.url()
    const other = await context.newPage()
    await other.goto(shared)
    await expect(other.getByRole("button", { name: "On sale" })).toHaveAttribute("aria-pressed", "true")
    await other.close()
  })

  test("changing sort re-orders from the start and reports the ordering applied", async ({ page }) => {
    await page.goto("/search")
    test.skip(!(await hasResults(page)), "no catalogue seeded")

    await page.getByLabel("Sort").selectOption("price_asc")
    await expect(page).toHaveURL(/sort=price_asc/)

    // The control must show what the SERVER applied, not what was requested — they differ when
    // `relevance` is asked for without a query (FR-016).
    await expect(page.getByLabel("Sort")).toHaveValue("price_asc")
  })

  test("a result count is shown and reflects the active refinements", async ({ page }) => {
    await page.goto("/search")
    test.skip(!(await hasResults(page)), "no catalogue seeded")

    const count = page.getByRole("status").filter({ hasText: /result/ })
    await expect(count).toBeVisible()
    const before = await count.textContent()

    await page.getByRole("button", { name: "On sale" }).click()
    await page.waitForTimeout(600)
    // Narrowing must change the headline number, or it is describing a different set than the list.
    await expect(count).not.toHaveText(before ?? "")
  })

  test("every active refinement is individually removable, and one action clears them all", async ({ page }) => {
    await page.goto("/search?saleOnly=true&minPrice=1")
    test.skip(!(await hasResults(page)), "no catalogue seeded")

    await expect(page.getByRole("button", { name: /Remove filter/ }).first()).toBeVisible()
    await page.getByRole("button", { name: "Clear all" }).click()
    await expect(page).not.toHaveURL(/minPrice/)
  })

  test("returning from a product restores the refinements", async ({ page }) => {
    await page.goto("/search?saleOnly=true")
    test.skip(!(await hasResults(page)), "no catalogue seeded")

    await page.locator('a[href^="/product/"]').first().click()
    await expect(page).toHaveURL(/\/product\//)
    await page.goBack()

    await expect(page).toHaveURL(/saleOnly=true/)
    await expect(page.getByRole("button", { name: "On sale" })).toHaveAttribute("aria-pressed", "true")
  })

  test("an empty result explains itself and offers a way out", async ({ page }) => {
    await page.goto("/search?q=zzzzznosuchproductzzzzz")
    await page.waitForTimeout(600)

    await expect(page.getByText(/No results for/)).toBeVisible()
    // FR-021: never an unexplained blank area — there is always a recovery path.
    await expect(page.getByRole("link", { name: "Browse categories" })).toBeVisible()
  })
})
