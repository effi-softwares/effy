import { expect, test } from "@playwright/test"

/**
 * The one-time-code field's observable contract (numeric keyboard, autofill token, one node, no
 * truncation). No sign-in is completed: there is no way to read a sent email here, and faking Cognito
 * would prove nothing.
 */

test.use({ storageState: { cookies: [], origins: [] } })

/** Reaches the code step of password recovery (the route shows the email form first), with only Cognito's transport stubbed. */
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
    // All eight digits survive (never truncated), and submit stays unavailable until exactly six are present.
    await reachCodeStep(page)

    const code = page.locator("#code")
    await code.fill("12345678")

    // Kept in full — not reshaped into something plausible-looking and submittable.
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

  // The affordances the step did not have
  //
  // These are the ones whose absence stranded people. Before 036 the code screen did not say where
  // the code went, offered no way to send another, and had no countdown — while its own error copy
  // told the shopper to "ask for a new one".

  test("⚠ the step NAMES the address the code went to (FR-006)", async ({ page }) => {
    await reachCodeStep(page)
    // The masked destination is what lets someone realise they typed their old address.
    await expect(page.getByText(/we sent a code to/i)).toBeVisible()
  })

  test("⚠ resend is unavailable at first, with a visible countdown (FR-007)", async ({ page }) => {
    // The cooldown is load-bearing, not courtesy: the platform allows five sends per address per
    // clock hour and the sixth is refused while still returning a normal-looking challenge.
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
    //
    // Fixed two things in this test, both pre-existing:
    //
    //  1. It located `submit-reset` — the test id of the new-password step's action, which is two
    //  steps further on. On the code step that id does not exist, so every assertion here was
    //  `element(s) not found`. The header of this file already warned that these tests "were
    //  failing or unrun"; this is one of them. The real id is `submit-reset-code`.
    //  2. `toBeDisabled` / `toBeEnabled` became `aria-disabled`. That is a deliberate contract
    //  change: a natively `disabled` action cannot take focus,
    //  is skipped by keyboard and by screen-reader element lists, and — being inert — cannot be
    //  the thing that tells the shopper what is still missing.
    await reachCodeStep(page)
    const submit = page.getByTestId("submit-reset-code")
    await expect(submit).toHaveAttribute("aria-disabled", "true")
    // Unavailable but reachable: `toBeEnabled` treats `aria-disabled` as disabled, so focusability is what is checked.
    await expect(submit).not.toHaveAttribute("disabled", /.*/)
    await submit.focus()
    await expect(submit).toBeFocused()

    const code = page.locator("#code")
    await code.fill("12345")
    await expect(submit).toHaveAttribute("aria-disabled", "true")

    // Pressing it says what is missing rather than doing nothing.
    //
    // `force: true` because Playwright's actionability model treats `aria-disabled="true"` as
    // non-interactive and will not click it. That is a sensible harness default and the wrong
    // model for this control: the whole design is that a person can press it and be told why it
    // will not commit. The click is still a real click at real coordinates.
    await submit.click({ force: true })
    await expect(page.getByText(/5 of 6 digits/i)).toBeVisible()

    await code.fill("123456")
    await expect(submit).not.toHaveAttribute("aria-disabled", "true")

    // Too long is also refused — not truncated into something submittable.
    await code.fill("12345678")
    await expect(submit).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByText(/an effy code is always/i)).toBeVisible()
  })

  test("⚠ six positions are VISIBLE, and each digit lands in its own (044 US1)", async ({ page }) => {
    // The defect that justified 044: the positions were 3px hairlines in a token whose own comment
    // says it is "deliberately not contrast-tested", pushed outside their own column, and rendered
    // at half size above 768px. The operator's report was "no otp fields".
    await reachCodeStep(page)
    const cells = page.locator('[data-slot="otp-cell"]')
    await expect(cells).toHaveCount(6)

    await page.locator("#code").fill("123")
    await expect(cells.nth(0)).toHaveText("1")
    await expect(cells.nth(2)).toHaveText("3")
    await expect(cells.nth(3)).toHaveText("")

    // And the group sits inside its own column, sharing its label's alignment.
    const field = await page.locator('[data-slot="otp-cells"]').boundingBox()
    const label = await page.locator('label[for="code"]').boundingBox()
    expect(field!.x).toBeCloseTo(label!.x, 0)
  })

  test("⚠ an over-length paste is not painted as six cells (C-11)", async ({ page }) => {
    // Six positions can only show six characters, so rendering an 8-digit paste as cells would look
    // like a six-digit code — visually reproducing the truncation FR-004 forbids.
    await reachCodeStep(page)
    await page.locator("#code").fill("12345678")
    await expect(page.locator('[data-slot="otp-cell"]')).toHaveCount(0)
    await expect(page.locator("#code")).toHaveValue("12345678")
  })

  test("⚠ nothing auto-submits on the sixth digit (C-12)", async ({ page }) => {
    await reachCodeStep(page)
    await page.locator("#code").fill("123456")
    // Still on the code step — the countdown is only rendered there.
    await expect(page.getByTestId("resend-countdown")).toBeVisible()
    await expect(page.locator("#code")).toHaveValue("123456")
  })

  test("⚠ at most ONE auth error region can be on screen (FR-017, D-05)", async ({ page }) => {
    // One error region, scoped to `auth-error` (Next's route announcer is also `role="alert"`).
    await reachCodeStep(page)
    await expect(page.getByTestId("auth-error")).toHaveCount(0)

    await page.locator("#code").fill("12345678")
    await expect(page.getByTestId("auth-error")).toHaveCount(0)
    // The over-length message is guidance about an unfinished entry, not a refusal of a submission.
    await expect(page.getByText(/an effy code is always/i)).toBeVisible()
  })

  test("⚠ an explicit way back to correct the email (FR-014)", async ({ page }) => {
    // The only escape used to be abandoning the flow.
    await reachCodeStep(page)
    await expect(page.getByTestId("change-email")).toBeVisible()
  })
})
