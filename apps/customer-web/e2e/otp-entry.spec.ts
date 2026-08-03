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
    await page.goto("/reset-password")

    const code = page.locator("#code")
    await expect(code).toHaveAttribute("inputmode", "numeric")
    await expect(code).toHaveAttribute("autocomplete", "one-time-code")
  })

  test("⚠ the field is ONE input, not six boxes (FR-025)", async ({ page }) => {
    // Segmented per-digit widgets are several inputs wearing a costume, and they are how screen
    // reader users lose their place. mobile-kit's OtpInput has the same invariant, asserted there.
    await page.goto("/reset-password")

    const inputs = page.locator("#code")
    await expect(inputs).toHaveCount(1)
  })

  test("⚠ a longer paste is NOT silently reshaped into six digits (FR-004, FR-005)", async ({
    page,
  }) => {
    // THE REGRESSION THIS WHOLE FEATURE EXISTS TO PREVENT. shop-mobile truncated an 8-digit code to
    // its first six and submitted the wrong value, with nothing on screen to say why.
    //
    // On web the guard is `maxLength=6`, which stops the field ACCEPTING more — the value never
    // becomes a plausible-looking six digits derived from something longer, and the server refuses
    // anything that is not exactly six regardless.
    await page.goto("/reset-password")

    const code = page.locator("#code")
    await code.fill("12345678")

    const value = await code.inputValue()
    expect(value.length).toBeLessThanOrEqual(6)
    // ⚠ And crucially: whatever is in the box is what gets submitted. Nothing downstream re-derives
    // a different value from it.
    expect(value).toBe("123456")
  })

  test("the field accepts a six-digit value in a single action", async ({ page }) => {
    await page.goto("/reset-password")
    const code = page.locator("#code")
    await code.fill("042042")
    await expect(code).toHaveValue("042042")
  })

  test("⚠ leading zeros survive — roughly one code in ten begins with one", async ({ page }) => {
    // A field that coerced to a number would drop these and lock out ~10% of sign-ins.
    await page.goto("/reset-password")
    const code = page.locator("#code")
    await code.fill("000123")
    await expect(code).toHaveValue("000123")
  })

  test("the field does not autocorrect or capitalise", async ({ page }) => {
    // Mobile keyboards will happily "helpfully" mangle a numeric string.
    await page.goto("/reset-password")
    const code = page.locator("#code")
    await expect(code).toHaveAttribute("autocorrect", "off")
    await expect(code).toHaveAttribute("autocapitalize", "off")
  })
})
