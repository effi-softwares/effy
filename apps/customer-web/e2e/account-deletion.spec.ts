import { expect, test } from "@playwright/test"

/**
 * The account-deletion surface, at the level Playwright can HONESTLY reach (034).
 *
 * ⚠⚠ READ THIS BEFORE ADDING A TEST HERE — IT IS THE SAME WARNING `account.spec.ts` CARRIES. ⚠⚠
 *
 * The obvious thing to write in this file is the SC-003 dirty-check matrix: open a field editor,
 * change a value, then dismiss it four ways (close control, Escape, backdrop click, browser back) and
 * assert each one prompts. That test **cannot honestly live here.**
 *
 * The editor is on `/account`, which is session-gated, and this suite has **no signed-in fixture** —
 * every spec runs with `storageState: { cookies: [], origins: [] }` because a real session needs a
 * real Cognito user and a real inbox. A spec that navigated to `/account` would land on the sign-in
 * redirect, find no editor, and every assertion written as "the discard prompt did not appear" would
 * pass while testing nothing at all. That is precisely the failure `account.spec.ts` documents: *"A
 * green test that cannot fail is worse than no test: it is a false statement with a tick next to it."*
 *
 * So the dirty-check proofs live where they can actually run:
 *
 *   • The **component** matrix — Save, Cancel, dirty vs clean, error preserves the typed value — is in
 *     `app/(account)/account/PersonalInfo.test.tsx`, which mounts the real editor.
 *   • The **browser** routes (Escape, backdrop, browser back) are an operator walk, quickstart §4a /
 *     task T093, because they need a signed-in session on a real build.
 *
 * What IS honestly reachable from a browser is below — and it is the half that carries the store
 * requirements, so it is worth more than a fake version of the other half.
 */

test.use({ storageState: { cookies: [], origins: [] } })

test.describe("the public deletion resource (FR-050 / FR-050a)", () => {
  /**
   * ⚠ GOOGLE PLAY REQUIRES THIS PAGE AND APPLE DOES NOT — which is exactly why it gets skipped, and
   * why an invalid or missing deletion link is the most-reported Play rejection in this area. Google's
   * three stated criteria are that the link be FUNCTIONAL, RELEVANT IN SCOPE, and REFERENCE THE APP OR
   * DEVELOPER NAME. Each is asserted below.
   */
  test("loads without error for someone who has never installed the app", async ({ page }) => {
    const res = await page.goto("/delete-account")
    expect(res?.status(), "Google requires the deletion URL to load without error").toBe(200)
  })

  test("references the app by name", async ({ page }) => {
    await page.goto("/delete-account")
    await expect(page.locator("h1")).toContainText(/Effy/i)
  })

  test("features the deletion path prominently, not buried in prose", async ({ page }) => {
    await page.goto("/delete-account")
    // A visible, reachable route to actually start the deletion — "relevant in scope".
    await expect(page.getByRole("link", { name: /delete my effy account/i })).toBeVisible()
  })

  test("says what is kept after deletion, and why", async ({ page }) => {
    await page.goto("/delete-account")
    const body = await page.locator("body").innerText()
    expect(body).toMatch(/tax and accounting/i)
  })

  /**
   * ⚠ SC-009 — the page never offers an alternative to deleting. Google's User Data policy is blunt:
   * *"Temporary account deactivation, disabling, or 'freezing' the app account does not qualify as
   * account deletion."*
   */
  test("never offers to deactivate, freeze or pause instead", async ({ page }) => {
    await page.goto("/delete-account")
    const body = (await page.locator("body").innerText()).toLowerCase()
    for (const word of ["deactivate", "freeze", "pause your account"]) {
      expect(body, `the deletion page must not offer to ${word}`).not.toContain(word)
    }
    expect(body).toContain("delete")
  })
})

test.describe("guest data deletion (FR-046)", () => {
  /**
   * ⚠ Apple's FAQ names guest accounts explicitly. This control has to be on a PUBLIC page: everything
   * else in the account area is behind a session, so a control anywhere else would be unreachable by
   * exactly the people who need it.
   */
  test("a guest can clear the data this browser holds", async ({ page }) => {
    await page.goto("/")
    // Seed something a guest would plausibly have.
    await page.evaluate(() => {
      window.localStorage.setItem("effy:saved:v1", '{"ids":["p1"]}')
      window.localStorage.setItem("effy:cart:v2", '{"lines":[{"productId":"p1"}]}')
    })

    await page.goto("/delete-account")
    await page.getByTestId("guest-clear-data").click()

    await expect(page.getByTestId("guest-cleared")).toBeVisible()

    // The stores rewrite their own keys to an empty shape rather than leaving stale contents.
    const leftovers = await page.evaluate(() =>
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("effy:"))
        .map((k) => [k, window.localStorage.getItem(k)] as const)
        .filter(([, v]) => !!v && /"p1"/.test(v)),
    )
    expect(leftovers, "no guest product data may survive the clear").toEqual([])
  })
})

test.describe("the in-app legal routes (FR-052)", () => {
  // Required by BOTH stores, and required to be publicly reachable — not geofenced, not a PDF.
  for (const path of ["/legal/privacy", "/legal/terms"]) {
    test(`${path} is publicly reachable`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.locator("h1")).toBeVisible()
    })
  }
})
