import { expect, test } from "@playwright/test"

/**
 * US3 — the store asks who you are only when it matters (FR-018 … FR-022, SC-008, SC-009).
 *
 * This is the rule that makes guest-first browsing real rather than nominal. A store that lets you
 * browse and then throws away your context at the login screen has simply moved the sign-in wall to
 * a more expensive place.
 */

test.describe("the sign-in demand is deferred to the point of ordering", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("a guest is NEVER prompted while browsing (FR-018 / SC-001)", async ({ page }) => {
    for (const path of ["/", "/browse"]) {
      await page.goto(path)
      expect(new URL(page.url()).pathname, `${path} redirected to sign-in`).toBe(path)
    }
  })

  test("the demand appears at CHECKOUT — and only there (FR-019)", async ({ page }) => {
    await page.goto("/checkout")

    await expect(page).toHaveURL(/\/sign-in/)

    // And it explains WHY it is asking now. The customer was browsing happily a second ago.
    await expect(page.getByTestId("deferred-reason")).toBeVisible()
  })

  test("the destination is carried across the demand (FR-020)", async ({ page }) => {
    await page.goto("/checkout")

    const next = new URL(page.url()).searchParams.get("next")
    expect(next).toBe("/checkout")
  })

  test("a deep link into the account area is preserved (FR-022)", async ({ page }) => {
    await page.goto("/account")

    await expect(page).toHaveURL(/\/sign-in/)
    expect(new URL(page.url()).searchParams.get("next")).toBe("/account")
  })

  test("declining is not punished — the customer keeps browsing (FR-021 / SC-009)", async ({
    page,
  }) => {
    await page.goto("/checkout")
    await expect(page).toHaveURL(/\/sign-in/)

    // Walk away from the demand.
    await page.getByRole("link", { name: "Effy home" }).click()

    await expect(page).toHaveURL(/localhost:3000\/$/)
    await expect(page.getByRole("heading", { name: "Groceries, delivered." })).toBeVisible()
  })
})

/**
 * ⚠ THE OPEN-REDIRECT REFUSALS.
 *
 * `?next=` is attacker-controlled: anyone can craft `/sign-in?next=https://evil.example` and send
 * it to a customer. If we honoured it, they would see a REAL Effy sign-in page and then land on a
 * convincing fake — with our own referrer vouching for it. This is the classic vulnerability in
 * exactly this feature, so it is tested at the boundary as well as in the unit tests.
 */
test.describe("the return destination cannot be weaponised", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const evil of [
    "https://evil.example/login",
    "//evil.example",
    "javascript:alert(1)",
    "/%09/evil.example",
  ]) {
    test(`refuses next=${evil}`, async ({ page }) => {
      await page.goto(`/sign-in?next=${encodeURIComponent(evil)}`)

      // The page renders (we do not error), but the hostile destination is discarded: the
      // "deferred" copy only shows for a genuine internal destination.
      await expect(page.getByRole("heading", { name: "Sign in to Effy" })).toBeVisible()
      await expect(page.getByTestId("deferred-reason")).toHaveCount(0)
    })
  }
})

/**
 * The credential routes on offer (FR-010).
 *
 * ⚠ GOOGLE IS BUILT BUT PARKED (operator decision, 2026-07-14). The code, the Terraform, the linking
 * trigger and the callback all exist and are dormant behind `customer_google_enabled`. With no
 * Cognito hosted domain configured there is no federation — and no button, because offering one
 * would be offering a door with no room behind it.
 *
 * These tests therefore assert the CURRENT capability set, and assert that the parked route is
 * genuinely absent rather than present-and-broken. When Google is un-parked, the domain lands in the
 * environment and these expectations flip — the test below is where you will notice.
 *
 * ⚠ We assert routes are OFFERED, not that they COMPLETE. Completing them needs a live Cognito pool
 * and a real inbox, which is an operator step (quickstart § 7). Mocking Cognito and calling that
 * proof would be exactly the dishonest green this slice has been careful to avoid.
 */
test.describe("the credential routes on offer", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("sign-in offers email code and password", async ({ page }) => {
    await page.goto("/sign-in")

    await expect(page.getByTestId("submit-email")).toBeVisible() // route (b) — the default

    await page.getByTestId("toggle-mode").click()
    await expect(page.getByTestId("submit-password")).toBeVisible() // route (a)
  })

  test("sign-up defaults to the PASSWORDLESS route", async ({ page }) => {
    await page.goto("/sign-up")

    // The fewer passwords the platform stores, the fewer it can lose — so the code route is the
    // path of least resistance, and the password is a deliberate opt-in.
    await expect(page.getByTestId("submit-email")).toBeVisible()

    await page.getByTestId("toggle-route").click()
    await expect(page.getByTestId("submit-password")).toBeVisible()
  })

  test("Google is PARKED — not offered, and not offered-but-broken", async ({ page }) => {
    for (const path of ["/sign-in", "/sign-up"]) {
      await page.goto(path)
      await expect(page.getByTestId("google-signin")).toHaveCount(0)
      await expect(page.getByTestId("google-signup")).toHaveCount(0)
    }
  })
})
