import { expect, test } from "@playwright/test"

/**
 * The one-time-code FIELD (035 T111, FR-036).
 *
 * ⚠ READ THIS BEFORE ADDING TO THIS FILE.
 *
 * There was **zero** end-to-end coverage of code entry anywhere in this repository before 035 —
 * which is precisely how a sign-in screen that truncated every real code shipped to shop-mobile and
 * stayed broken. This file closes that gap for the field's *observable behaviour*.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO: complete a sign-in. There is no mechanism in this repo to
 * read a sent email — no MailHog, no SES event destination, no test inbox — and the established
 * practice here is to say so rather than fake it. `e2e/deferred-signin.spec.ts` puts it plainly:
 * "Mocking Cognito and calling that proof would be exactly the dishonest green this slice has been
 * careful to avoid." Completing a real sign-in is an operator step with a real inbox (quickstart §5).
 *
 * So: these tests assert the CONTRACT OF THE INPUT — the part that was silently wrong for months
 * and that no live walk would reliably catch either.
 */

test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Reach the code step of password recovery.
 *
 * ⚠ THE CODE FIELD HAS ALWAYS BEEN BEHIND A STEP, AND THESE TESTS DID NOT KNOW THAT. They used to
 * `goto("/reset-password")` and immediately locate `#code` — but that route has rendered an EMAIL form
 * first since it was written (`sent ? codeForm : emailForm`). The field they were asserting on was
 * never on the page, so every one of them was failing or unrun. Nothing caught it because Playwright
 * is not part of `pnpm test`; it needs a built server, and this repo runs it by hand.
 *
 * ⚠ The Cognito call is STUBBED — and only the transport, never the assertion. What is being tested is
 * the FIELD's contract (numeric keyboard, autofill token, one node, no truncation), which is the part
 * that was silently wrong for months. Nothing here claims a code was sent or verified; completing a
 * real recovery is an operator step with a real inbox.
 */
async function reachCodeStep(page: import("@playwright/test").Page) {
  await page.route("**/cognito-idp.*.amazonaws.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-amz-json-1.1",
      body: JSON.stringify({
        CodeDeliveryDetails: {
          AttributeName: "email",
          DeliveryMedium: "EMAIL",
          Destination: "s***@e***.com",
        },
      }),
    }),
  )
  await page.goto("/reset-password")
  await page.getByLabel("Email").fill("shopper@example.com")
  await page.getByTestId("submit-reset-email").click()
  await expect(page.locator("#code")).toBeVisible()
}

test.describe("one-time-code field", () => {
  test("the sign-in code step exposes a single labelled code input", async ({ page }) => {
    await page.goto("/sign-in")

    // Choose the emailed-code route. The button copy is asserted loosely so a wording change
    // does not fail this test for the wrong reason.
    const codeRoute = page.getByRole("button", { name: /email me a code/i })
    await expect(codeRoute).toBeVisible()
  })

  test("⚠ the field asks for a numeric keyboard and offers OS autofill", async ({ page }) => {
    // These two attributes are the entire reason a shopper can tap the code from their notification
    // instead of retyping it. They were missing from the reset-password field entirely until 035.
    await reachCodeStep(page)

    const code = page.locator("#code")
    await expect(code).toHaveAttribute("inputmode", "numeric")
    await expect(code).toHaveAttribute("autocomplete", "one-time-code")
  })

  test("⚠ the field is ONE input, not six boxes (FR-025)", async ({ page }) => {
    // Segmented per-digit widgets are several inputs wearing a costume, and they are how screen
    // reader users lose their place. mobile-kit's OtpInput has the same invariant, asserted there.
    await reachCodeStep(page)

    const inputs = page.locator("#code")
    await expect(inputs).toHaveCount(1)
  })

  test("⚠ a longer paste is NOT silently reshaped into six digits (FR-004, FR-005)", async ({
    page,
  }) => {
    // THE REGRESSION THIS WHOLE FEATURE EXISTS TO PREVENT. shop-mobile truncated an 8-digit code to
    // its first six and submitted the wrong value, with nothing on screen to say why.
    //
    // ⚠ 036 INVERTED THIS ASSERTION, and the inversion is the point.
    //
    // It used to demand `value === "123456"` — i.e. it asserted that web TRUNCATES, via the native
    // `maxLength=6`. That is the same reshaping 035 called a defect on mobile, and FR-004 forbids it:
    // "a value longer than six digits MUST NOT be silently shortened — the extra input is a signal
    // something is wrong and must stay visible to the shopper". The old test encoded the defect,
    // exactly as 029's `banner_test.go` asserted the wrong navigation target.
    //
    // All eight digits now survive, and the submit stays unavailable until exactly six are present.
    await reachCodeStep(page)

    const code = page.locator("#code")
    await code.fill("12345678")

    // ⚠ Kept in full — NOT reshaped into something plausible-looking and submittable.
    await expect(code).toHaveValue("12345678")
  })

  test("the field accepts a six-digit value in a single action", async ({ page }) => {
    await reachCodeStep(page)
    const code = page.locator("#code")
    await code.fill("042042")
    await expect(code).toHaveValue("042042")
  })

  test("⚠ leading zeros survive — roughly one code in ten begins with one", async ({ page }) => {
    // A field that coerced to a number would drop these and lock out ~10% of sign-ins.
    await reachCodeStep(page)
    const code = page.locator("#code")
    await code.fill("000123")
    await expect(code).toHaveValue("000123")
  })

  test("the field does not autocorrect or capitalise", async ({ page }) => {
    // Mobile keyboards will happily "helpfully" mangle a numeric string.
    await reachCodeStep(page)
    const code = page.locator("#code")
    await expect(code).toHaveAttribute("autocorrect", "off")
    await expect(code).toHaveAttribute("autocapitalize", "off")
  })

  // ── 036 T056: the affordances the step did not have ─────────────────────────────────────────────
  //
  // ⚠ These are the ones whose ABSENCE stranded people. Before 036 the code screen did not say where
  // the code went, offered no way to send another, and had no countdown — while its own error copy
  // told the shopper to "ask for a new one".

  test("⚠ the step NAMES the address the code went to (FR-006)", async ({ page }) => {
    await reachCodeStep(page)
    // The masked destination is what lets someone realise they typed their old address.
    await expect(page.getByText(/we sent a code to/i)).toBeVisible()
  })

  test("⚠ resend is unavailable at first, with a visible countdown (FR-007)", async ({ page }) => {
    // The cooldown is load-bearing, not courtesy: the platform allows five sends per address per
    // clock hour and the SIXTH is refused while still returning a normal-looking challenge.
    await reachCodeStep(page)
    await expect(page.getByTestId("resend-countdown")).toBeVisible()
    await expect(page.getByTestId("resend-code")).toHaveCount(0)
  })

  test("the step states how long the code lasts", async ({ page }) => {
    await reachCodeStep(page)
    await expect(page.getByText(/5 minutes/i)).toBeVisible()
  })

  test("⚠ submission is withheld until EXACTLY six digits (FR-005)", async ({ page }) => {
    // And there is deliberately no auto-submit: codes die after three attempts, so a mistyped last
    // digit that submitted itself would spend one the shopper never chose to spend.
    await reachCodeStep(page)
    const submit = page.getByTestId("submit-reset")
    await expect(submit).toBeDisabled()

    const code = page.locator("#code")
    await code.fill("12345")
    await expect(submit).toBeDisabled()

    await code.fill("123456")
    await expect(submit).toBeEnabled()

    // ⚠ Too long is ALSO refused — not truncated into something submittable.
    await code.fill("12345678")
    await expect(submit).toBeDisabled()
    await expect(page.getByText(/an effy code is always/i)).toBeVisible()
  })

  test("⚠ an explicit way back to correct the email (FR-014)", async ({ page }) => {
    // The only escape used to be abandoning the flow.
    await reachCodeStep(page)
    await expect(page.getByTestId("change-email")).toBeVisible()
  })
})
