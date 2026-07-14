import { expect, test } from "@playwright/test"

/**
 * SC-001 / FR-001 / FR-018 — guest-first is the whole product model.
 *
 * A storefront that demands an account before it will show you anything cannot acquire a
 * customer. These tests assert that a visitor with no session can use the entire public surface
 * and is asked to sign in ZERO times while doing so.
 */

const PUBLIC_PAGES = ["/", "/browse"] as const

test.describe("a guest browses with no account (SC-001)", () => {
  test.use({ storageState: { cookies: [], origins: [] } }) // a genuinely fresh visitor

  for (const path of PUBLIC_PAGES) {
    test(`${path} is fully usable with no session and never demands one`, async ({ page }) => {
      await page.goto(path)

      // It rendered.
      await expect(page.locator("h1")).toBeVisible()

      // It did not redirect us to a sign-in wall.
      expect(new URL(page.url()).pathname).toBe(path)

      // It offers sign-in; it does not demand it.
      await expect(page.getByTestId("sign-in-link")).toBeVisible()
      await expect(page.getByTestId("account-link")).toHaveCount(0)
    })
  }

  test("a guest can move between public pages without ever being prompted", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Start browsing" }).click()
    await expect(page).toHaveURL(/\/browse$/)

    // ⚠ Address the heading BY NAME, not by tag. Under `cacheComponents` Next 16 keeps the
    // previous route mounted (React <Activity>) after a client-side navigation, so a bare
    // `locator("h1")` matches BOTH the old page's heading and the new one and fails Playwright's
    // strict mode. That is the framework preserving UI state, not a bug in the page.
    await expect(
      page.getByRole("heading", { name: "Browse the store" }),
    ).toBeVisible()

    // At no point did we land on sign-in.
    expect(page.url()).not.toContain("/sign-in")
  })
})

/**
 * SC-013 — AN AUTHENTICATION OUTAGE MUST NOT TAKE DOWN THE STOREFRONT.
 *
 * A guest who was never going to sign in should be completely unaffected by the account system
 * being down. This is plausible by construction — guest routes load no auth SDK and make no
 * Cognito call — but "plausible by construction" is exactly the kind of claim that quietly
 * stops being true. So we sever Cognito and check.
 */
test.describe("an auth outage leaves guest browsing intact (SC-013)", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const path of PUBLIC_PAGES) {
    test(`${path} still works with every Cognito request blocked`, async ({ page }) => {
      // Simulate the identity provider being entirely unreachable.
      await page.route("**/*.amazoncognito.com/**", (route) => route.abort())
      await page.route("**/cognito-idp.*.amazonaws.com/**", (route) => route.abort())

      const failures: string[] = []
      page.on("pageerror", (e) => failures.push(e.message))

      await page.goto(path)

      // The page renders and is usable.
      await expect(page.locator("h1")).toBeVisible()
      await expect(page.getByTestId("sign-in-link")).toBeVisible()

      // And nothing on the guest path even tried to reach the account system.
      expect(failures).toHaveLength(0)
    })
  }
})
