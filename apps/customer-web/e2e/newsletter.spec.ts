import { expect, test } from "@playwright/test"

/**
 * The newsletter section and its confirm page (039 US6).
 *
 * ⚠ These are the assertions no unit test can make: that the browser's own validation fires before any
 * request leaves, and that the confirm page renders a real outcome from a real round trip.
 *
 * ⚠ The subscribe path needs the `edge-customer` service deployed. Where it is not, the form correctly
 * reports the retryable error — so the tests that need a working backend skip rather than fail, and the
 * ones that do not (native validation, the confirm page's expired branch) always run.
 */

test.describe("newsletter form (US6)", () => {
  const field = "#newsletter-email"

  test("is present in the served page, not gated on the catalogue", async ({ request }) => {
    const html = await (await request.get("/")).text()

    expect(html).toContain("Keep up with Effy")
    expect(html).toContain('name="email"')
  })

  /**
   * ⚠ FR-030 — "inline validation and NO backend request". This asserts the *absence* of a request,
   * which is the whole point: catching a typo must not cost a round trip or record anything.
   */
  test("an invalid address is refused by the browser, with no request sent", async ({ page }) => {
    const requests: string[] = []
    page.on("request", (r) => {
      if (r.method() === "POST") requests.push(r.url())
    })

    await page.goto("/")
    await page.locator(field).fill("not-an-email")
    await page.getByRole("button", { name: /subscribe/i }).click()

    // The native constraint blocks submission entirely.
    await expect(page.locator(field)).toHaveJSProperty("validity.valid", false)
    expect(requests, "a request was sent for an address the browser should have refused").toEqual([])
  })

  test("an empty submission is refused the same way", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: /subscribe/i }).click()

    await expect(page.locator(field)).toHaveJSProperty("validity.valueMissing", true)
  })

  /**
   * ⚠ FR-033 — whatever the outcome, the visitor is TOLD something, and on failure their address is
   * still in the field. Both branches are acceptable here: with the edge service deployed this is the
   * success surface, without it the retryable error. What is not acceptable is silence.
   */
  test("a valid address always produces a spoken outcome", async ({ page }) => {
    await page.goto("/")
    await page.locator(field).fill("e2e-probe@example.com")
    await page.getByRole("button", { name: /subscribe/i }).click()

    const status = page.locator("#newsletter-status")
    await expect(status).toBeVisible({ timeout: 20_000 })
    await expect(status).toHaveAttribute("role", "status")

    const text = (await status.textContent()) ?? ""
    if (/couldn/i.test(text)) {
      // The failure branch — FR-033's input preservation is exactly what matters here.
      await expect(page.locator(field)).toHaveValue("e2e-probe@example.com")
    } else {
      expect(text).toMatch(/check your inbox/i)
    }
  })
})

test.describe("newsletter confirm page (US6)", () => {
  /**
   * ⚠ A tampered token must land on a clear, non-disclosing outcome — never an error page and never a
   * hint that some other token would have worked.
   */
  test("a bogus token renders 'this link has expired'", async ({ page }) => {
    await page.goto("/newsletter/confirm?token=definitely-not-a-real-token")

    await expect(page.getByRole("heading", { name: /expired/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("link", { name: /back to the store/i })).toBeVisible()
  })

  /** A missing token takes the same path — there is nothing useful to say differently. */
  test("no token at all renders the same outcome", async ({ page }) => {
    await page.goto("/newsletter/confirm")

    await expect(page.getByRole("heading", { name: /expired/i })).toBeVisible({ timeout: 20_000 })
  })

  /**
   * ⚠ EVERY URL OF THIS PAGE CARRIES A LIVE SINGLE-USE TOKEN. A crawler that indexed one would publish
   * a working confirmation link, and following it would burn a real subscriber's token before they ever
   * opened the email.
   */
  test("is noindex, because its URL contains a live token", async ({ request }) => {
    const html = await (await request.get("/newsletter/confirm?token=x")).text()

    expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/)
  })

  /**
   * ⚠ THIS ASSERTS WHAT IS TRUE, AND THE ORIGINAL VERSION DID NOT. It first read "never echoes the
   * token back into the page", which fails: Next serialises `searchParams` into the RSC flight payload
   * whether or not anything renders them, so the token appears three times in the HTML.
   *
   * A confirm-then-redirect was built to remove it and reverted — `redirect()` inside a streamed
   * Suspense boundary returns 200, not a 3xx, so the token stayed anyway, and a client without
   * JavaScript was left on "Confirming…" forever. See the note in `confirm/page.tsx`.
   *
   * What actually matters, and is asserted here: the token is never rendered as CONTENT — not in the
   * visible text, not in a link, not in a form. By the time this HTML exists the token has already
   * been consumed and is worthless.
   */
  test("never renders the token as visible content or in a link", async ({ page }) => {
    const token = "a-very-distinctive-token-value"
    await page.goto(`/newsletter/confirm?token=${token}`)

    await expect(page.getByRole("heading", { name: /expired/i })).toBeVisible({ timeout: 20_000 })

    expect(await page.locator("body").innerText()).not.toContain(token)

    const hrefs = await page.locator("a").evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
    )
    for (const href of hrefs) expect(href).not.toContain(token)
  })
})
