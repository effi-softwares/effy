import { expect, test, type Page } from "@playwright/test"

/**
 * 044 US2 — nothing is sent to an address the platform would refuse.
 *
 * ⚠ THE LOAD-BEARING ASSERTION IN THIS FILE IS THE ABSENCE OF A NETWORK REQUEST, not the presence of
 * a message. A screen that shows an error AND still dispatches the code has not fixed anything: the
 * shopper is still parked on a code step waiting for an email that cannot arrive, on a screen that
 * deliberately cannot tell them why (distinguishing "not delivered" from "wrong code" would leak
 * whether an account exists).
 *
 * Baseline, measured against the shipped build before this slice (see `BASELINE.md`):
 *   • `person@example` was accepted at all three email entry points and a real `POST` went out to
 *     Cognito for it; on SIGN-UP the shopper was advanced to the code step.
 *   • an empty address was blocked by the browser on the first step of each journey — but NOT on the
 *     password steps, where the field is `readOnly` and therefore exempt from constraint validation,
 *     so it reached `signInWithPassword("")` and returned "Something went wrong."
 */

test.use({ storageState: { cookies: [], origins: [] } })

/** Every request that would mean we tried to talk to Cognito about this address. */
function watchCognito(page: Page): string[] {
  const seen: string[] = []
  page.on("request", (r) => {
    if (/cognito|amazonaws\.com/.test(r.url())) seen.push(`${r.method()} ${r.url()}`)
  })
  return seen
}

const ENTRY_POINTS = [
  {
    name: "sign-in · email",
    open: async (page: Page) => page.goto("/sign-in"),
    submit: "submit-email",
  },
  {
    name: "sign-up · email",
    open: async (page: Page) => page.goto("/sign-up"),
    submit: "submit-email",
  },
  {
    name: "reset · email",
    open: async (page: Page) => page.goto("/reset-password"),
    submit: "submit-reset-email",
  },
] as const

test.describe("validation refuses before anything is sent (FR-009, V-14)", () => {
  for (const entry of ENTRY_POINTS) {
    test(`${entry.name} — an EMPTY address is refused, and nothing leaves the page`, async ({
      page,
    }) => {
      const requests = watchCognito(page)
      await entry.open(page)
      await page.getByTestId(entry.submit).click()

      await expect(page.getByText(/enter your email address/i)).toBeVisible()
      expect(requests, "an empty address must not reach the platform").toEqual([])
    })

    test(`${entry.name} — ⚠ person@example is refused, and nothing leaves the page (SC-004)`, async ({
      page,
    }) => {
      const requests = watchCognito(page)
      await entry.open(page)
      await page.locator("#email").fill("person@example")
      await page.getByTestId(entry.submit).click()

      await expect(page.getByText(/doesn't look like an email address/i)).toBeVisible()
      expect(requests, "a malformed address must not reach the platform").toEqual([])
    })

    test(`${entry.name} — a whitespace-only address counts as empty (D-12)`, async ({ page }) => {
      const requests = watchCognito(page)
      await entry.open(page)
      await page.locator("#email").fill("   ")
      await page.getByTestId(entry.submit).click()

      await expect(page.getByText(/enter your email address/i)).toBeVisible()
      expect(requests).toEqual([])
    })
  }

  test("⚠ the password step cannot be REACHED without an address (D-11, the half that was real)", async ({
    page,
  }) => {
    // Reaching the password step without ever filling the email used to produce
    // "Something went wrong. Please try again." — the address never existed, and the shopper was
    // told the system had failed.
    //
    // ⚠ THE FIX IS TO REFUSE THE MOVE, NOT TO SHOW AN ERROR ON THE PASSWORD STEP. The email input
    // is deliberately still mounted there (FR-040 — password managers pair it with the password to
    // fill and to save) but inside a hidden container, so a message attached to it renders HIDDEN.
    // This test's first version asserted exactly that message and Playwright reported
    // "resolved to <p>Enter your email address.</p> — unexpected value hidden", which is how the
    // problem was found. An invisible error is only marginally better than the wrong one.
    const requests = watchCognito(page)
    await page.goto("/sign-in")
    await page.getByTestId("toggle-mode").click()

    // Still on the email step, and told why.
    await expect(page.getByText(/enter your email address/i)).toBeVisible()
    await expect(page.getByTestId("submit-email")).toBeVisible()
    await expect(page.getByTestId("submit-password")).toHaveCount(0)
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
    expect(requests).toEqual([])
  })

  test("⚠ …and the same on sign-up", async ({ page }) => {
    const requests = watchCognito(page)
    await page.goto("/sign-up")
    await page.getByTestId("toggle-route").click()
    await expect(page.getByText(/enter your email address/i)).toBeVisible()
    await expect(page.getByTestId("submit-email")).toBeVisible()
    expect(requests).toEqual([])
  })

  test("a valid address DOES open the password step, carrying the email forward", async ({
    page,
  }) => {
    await page.goto("/sign-in")
    await page.locator("#email").fill("person@example.com")
    await page.getByTestId("toggle-mode").click()
    await expect(page.getByTestId("submit-password")).toBeVisible()
    await expect(page.locator("#email")).toHaveValue("person@example.com")
  })
})

test.describe("how a message behaves (FR-011, FR-012, FR-013)", () => {
  test("an untouched field shows nothing before the first submission (V-11)", async ({ page }) => {
    await page.goto("/sign-in")
    await expect(page.getByText(/enter your email address/i)).toHaveCount(0)
    await expect(page.getByText(/doesn't look like an email address/i)).toHaveCount(0)
  })

  test("⚠ a message appears when the customer LEAVES the field, not only on submit (V-09)", async ({
    page,
  }) => {
    await page.goto("/sign-in")
    await page.locator("#email").fill("person@example")
    await page.locator("#email").blur()
    await expect(page.getByText(/doesn't look like an email address/i)).toBeVisible()
  })

  test("focusing and leaving an EMPTY field says nothing — that is not a mistake", async ({
    page,
  }) => {
    await page.goto("/sign-in")
    await page.locator("#email").focus()
    await page.locator("#email").blur()
    await expect(page.getByText(/enter your email address/i)).toHaveCount(0)
  })

  test("⚠ the message clears on correction, with no second submission (V-12)", async ({ page }) => {
    await page.goto("/sign-in")
    const email = page.locator("#email")
    await email.fill("person@example")
    await email.blur()
    await expect(page.getByText(/doesn't look like an email address/i)).toBeVisible()

    await email.fill("person@example.com")
    await expect(page.getByText(/doesn't look like an email address/i)).toHaveCount(0)
  })

  test("the message is beside the field and linked to it, not a browser bubble (V-05, V-06)", async ({
    page,
  }) => {
    await page.goto("/sign-in")
    await page.getByTestId("submit-email").click()
    const email = page.locator("#email")
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await expect(email).toHaveAttribute("aria-describedby", /.+/)
  })

  test("⚠ a refused submission moves focus to the problem (V-08, FR-014)", async ({ page }) => {
    await page.goto("/sign-in")
    await page.getByTestId("submit-email").click()
    await expect(page.locator("#email")).toBeFocused()
  })

  test("⚠ a well-formed address with no account is ACCEPTED by validation (FR-044)", async ({
    page,
  }) => {
    // Validation answers "is this well-formed", never "does this exist". If it refused unknown
    // addresses it would be an account-existence oracle for anyone who asked.
    await page.route("**/cognito-idp.*.amazonaws.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-amz-json-1.1",
        body: JSON.stringify({
          CodeDeliveryDetails: {
            AttributeName: "email",
            DeliveryMedium: "EMAIL",
            Destination: "n***@e***.com",
          },
        }),
      }),
    )
    await page.goto("/reset-password")
    await page.locator("#email").fill("nobody-at-all-4d9f@example.com")
    await page.getByTestId("submit-reset-email").click()
    await expect(page.locator("#code")).toBeVisible()
  })
})

test.describe("the password rule is stated and reflected (FR-016)", () => {
  /**
   * ⚠ The address comes first. These two tests originally toggled straight to the password step with
   * an empty email and failed — correctly, because identifier-first now refuses that move. The tests
   * were wrong, not the guard.
   */
  async function reachPasswordStep(page: Page) {
    await page.goto("/sign-up")
    await page.locator("#email").fill("person@example.com")
    await page.getByTestId("toggle-route").click()
    await expect(page.locator("#password")).toBeVisible()
  }

  test("the requirement is visible before anything is typed", async ({ page }) => {
    await reachPasswordStep(page)
    await expect(page.getByText(/at least 12 characters/i)).toBeVisible()
  })

  test("⚠ progress is reflected AS the customer types, not only refused at the end", async ({
    page,
  }) => {
    // Before 044 the only signal that a password was too short was an action that stayed unavailable
    // with nothing saying why. This is a count, not a strength meter — the policy is a length and
    // nothing else.
    await reachPasswordStep(page)
    await page.locator("#password").fill("short")
    await expect(page.getByText(/5 of 12 characters/i)).toBeVisible()
  })

  test("⚠ a short password is refused with the rule stated, and nothing is sent", async ({
    page,
  }) => {
    const requests = watchCognito(page)
    await reachPasswordStep(page)
    await page.locator("#password").fill("short")
    await page.getByTestId("submit-password").click()
    await expect(page.getByText(/use at least 12 characters/i)).toBeVisible()
    expect(requests).toEqual([])
  })
})
