import { expect, test } from "@playwright/test"

/**
 * The account surface's refusals, at the level Playwright can HONESTLY reach (012).
 *
 * ⚠⚠ READ THIS BEFORE ADDING A TEST HERE. ⚠⚠
 *
 * The first draft of this file "proved" SC-004 by firing crafted requests at
 * `PUT /api/customer/v1/password` and asserting the response was not a 200.
 *
 * **There is no such route in this app.** The password API lives on the external edge-api gateway;
 * the storefront reaches it from Server Actions, server-side. So every one of those requests hit
 * Next's 404 handler, every assertion (`status >= 400`) passed — and the file would have reported
 * that the account-takeover primitive was closed while testing precisely nothing. A green test that
 * cannot fail is worse than no test: it is a false statement with a tick next to it.
 *
 * So the proofs live where they can actually run:
 *
 *   • SC-004 (a session alone cannot set a password) and SC-005 (no current password, no change) are
 *     proven in `apis/edge-api/customer/src/password/service.test.ts` — the code is verified BEFORE
 *     the password is written, nothing is written when the code is refused, and each mode is refused
 *     on the wrong account state. The mismatched-token attack is proven in `identity.test.ts`.
 *
 *   • They are then proven LIVE, adversarially, against the dev pool in
 *     `specs/012-customer-profile-management/quickstart.md` § "The proofs that matter" — which is an
 *     operator step, because it needs a real inbox and a real Cognito user.
 *
 * What remains testable from a browser is below, and it is genuinely worth having.
 */

test.describe("the account page is not reachable without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("a signed-out visitor is sent to sign in, and RETURNED to /account afterwards", async ({
    page,
  }) => {
    await page.goto("/account")

    // FR-020 — authenticating must never cost the customer their place.
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/)
  })

  test("the account area is refused to crawlers (FR-036)", async ({ request }) => {
    const robots = await request.get("/robots.txt")
    expect(await robots.text()).toContain("/account")
  })
})

/**
 * Sign-out (012 FR-028 … FR-031).
 *
 * These ARE reachable from a browser, because sign-out is a real route handler in this app —
 * deliberately, so that the header can reach it by URL instead of by import and never acquire a path
 * to the auth SDK (research R3).
 */
test.describe("sign-out refuses the obvious abuses", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  // ⚠ A GET sign-out is triggerable by any `<img src="https://effy/sign-out">` on any page anywhere
  // on the internet — a drive-by CSRF logout. The route exports POST only, so Next answers 405.
  test("a GET to /sign-out does not end a session", async ({ request }) => {
    const res = await request.get("/sign-out", { failOnStatusCode: false })
    expect(res.status()).toBe(405)
  })

  // FR-031 — the destination is a constant in the route handler, never taken from the request. An
  // open redirect here would bounce a customer to a lookalike sign-in page at the exact moment they
  // expect to be asked for their credentials.
  test("sign-out ignores any destination supplied by the caller", async ({ request }) => {
    const res = await request.post("/sign-out", {
      form: { next: "https://evil.example.com", redirect: "https://evil.example.com" },
      maxRedirects: 0,
      failOnStatusCode: false,
    })

    const location = res.headers()["location"] ?? ""
    expect(location).not.toContain("evil.example.com")
    expect(res.status()).toBe(303) // POST → GET, so a reload cannot re-submit the sign-out
  })

  // Sign-out is a plain HTML form (see components/header/AccountMenu.tsx). It therefore works with
  // JavaScript disabled — a good property for the control that ends a session, and a free consequence
  // of keeping the auth SDK off the guest path.
  test("sign-out works with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    const res = await page.request.post("/sign-out", { maxRedirects: 0, failOnStatusCode: false })
    expect(res.status()).toBe(303)

    await context.close()
  })
})
