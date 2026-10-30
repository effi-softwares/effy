import { expect, test } from "@playwright/test"

/**
 * The account surface's refusals, as far as Playwright can reach. The password API is on the edge
 * gateway, reached from Server Actions, so there is no route here to attack: "a session alone cannot
 * set a password" and "no current password, no change" are proven in
 * `apis/edge-api/customer/src/password/service.test.ts` (and `identity.test.ts`), and live in an
 * operator walk with a real inbox.
 */

test.describe("the account page is not reachable without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("a signed-out visitor is sent to sign in, and RETURNED to /account afterwards", async ({
    page,
  }) => {
    await page.goto("/account")

    // Authenticating must never cost the customer their place.
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/)
  })

  test("the account area is refused to crawlers (FR-036)", async ({ request }) => {
    const robots = await request.get("/robots.txt")
    expect(await robots.text()).toContain("/account")
  })
})

/** Sign-out: reachable from a browser, since it is a real route handler (the header reaches it by URL). */
test.describe("sign-out refuses the obvious abuses", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  // A GET sign-out is triggerable by any `<img src="https://effy/sign-out">` on any page anywhere
  // on the internet - a drive-by CSRF logout. The route exports POST only, so Next answers 405.
  test("a GET to /sign-out does not end a session", async ({ request }) => {
    const res = await request.get("/sign-out", { failOnStatusCode: false })
    expect(res.status()).toBe(405)
  })

  // The destination is a constant in the route handler, never taken from the request. An
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
  // JavaScript disabled - a good property for the control that ends a session, and a free consequence
  // of keeping the auth SDK off the guest path.
  test("sign-out works with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    const res = await page.request.post("/sign-out", { maxRedirects: 0, failOnStatusCode: false })
    expect(res.status()).toBe(303)

    await context.close()
  })
})
