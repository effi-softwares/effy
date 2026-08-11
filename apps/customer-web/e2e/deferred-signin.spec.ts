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
    for (const path of ["/", "/search"]) {
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

  /**
   * ⚠ 044 ADDED THE EMAIL TO BOTH OF THESE, AND THE ADDITION IS THE BEHAVIOUR CHANGE.
   *
   * These used to toggle straight to the password step with the email field empty. That worked, and
   * it was the shape of a real defect: the email input is deliberately still mounted on the password
   * step (FR-040 — password managers pair it with the password to fill and, more fragilely, to save)
   * but inside a hidden container, so a step reached without an address could refuse and could not
   * explain. Measured on the shipped build, submitting there produced "Something went wrong. Please
   * try again." about an address the shopper had never typed (BASELINE.md, D-11).
   *
   * Identifier-first now means what it says: the address comes first. What these tests are really
   * about — that a password route is on offer at all — is unchanged.
   */
  test("sign-in offers email code and password", async ({ page }) => {
    await page.goto("/sign-in")

    await expect(page.getByTestId("submit-email")).toBeVisible() // route (b) — the default

    await page.locator("#email").fill("shopper@example.com")
    await page.getByTestId("toggle-mode").click()
    await expect(page.getByTestId("submit-password")).toBeVisible() // route (a)
  })

  test("sign-up defaults to the PASSWORDLESS route", async ({ page }) => {
    await page.goto("/sign-up")

    // The fewer passwords the platform stores, the fewer it can lose — so the code route is the
    // path of least resistance, and the password is a deliberate opt-in.
    await expect(page.getByTestId("submit-email")).toBeVisible()

    await page.locator("#email").fill("shopper@example.com")
    await page.getByTestId("toggle-route").click()
    await expect(page.getByTestId("submit-password")).toBeVisible()
  })

  test("⚠ NO screen before the account exists asks for a name (036 FR-027, SC-005)", async ({
    page,
  }) => {
    // ⚠ THIS ASSERTION IS THE INVERSE OF THE ONE IT REPLACES. 011's FR-009a put First name and Last
    // name ABOVE the email field, so the very first thing a stranger was asked for was personal data,
    // before they had any reason to trust the form. 036 FR-032 supersedes it: the name is now the
    // LAST step, asked once the account exists and the customer is signed in.
    await page.goto("/sign-up")

    await expect(page.getByLabel("First name")).toHaveCount(0)
    await expect(page.getByLabel("Last name")).toHaveCount(0)

    // And still absent on the password step.
    await page.getByTestId("toggle-route").click()
    await expect(page.getByLabel("First name")).toHaveCount(0)
    await expect(page.getByLabel("Last name")).toHaveCount(0)
  })

  test("⚠ the password step asks for the password ONCE, with a reveal (036 FR-030)", async ({
    page,
  }) => {
    // ⚠ REPLACES a test that asserted a "confirm password" field and a mismatch guard. 012's FR-023
    // states the platform MUST NOT ask for a re-typed confirmation — the reveal toggle replaces it,
    // which is GOV.UK's published reasoning and what the account page already did. Web sign-up was
    // the one surface still disagreeing; mobile never had a confirm field.
    await page.goto("/sign-up")
    await page.getByTestId("toggle-route").click()

    await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
    await expect(page.getByLabel("Confirm password")).toHaveCount(0)
    await expect(page.getByTestId("password-mismatch")).toHaveCount(0)

    // The reveal is what makes the single field safe to type into.
    await expect(page.getByRole("button", { name: /show password/i })).toBeVisible()
  })

  test("⚠ the stated password rule matches the rule the platform enforces (036 FR-029)", async ({
    page,
  }) => {
    // ⚠ The old copy promised "at least 8 characters, with upper and lower case letters and a
    // number" — BOTH too short and falsely restrictive, since the real policy is 12 with no
    // composition rules. A rule stated wrongly is worse than none: it rejects valid passwords.
    await page.goto("/sign-up")
    await page.getByTestId("toggle-route").click()

    await expect(page.getByText(/at least 12 characters/i)).toBeVisible()
    await expect(page.getByText(/upper and lower case/i)).toHaveCount(0)
  })

  test("⚠ Google is OFFERED, and says honestly that it is not ready (036 FR-038, FR-039)", async ({
    page,
  }) => {
    // ⚠ INVERTS the old assertion of `toHaveCount(0)`. The operator asked for the control to ship now
    // and the capability later. The mitigation for an unbacked button is FR-039: a specific,
    // non-alarming refusal — never the generic "Something went wrong", which would be a lie, because
    // nothing went wrong.
    await page.goto("/sign-in")
    await expect(page.getByTestId("google-signin")).toBeVisible()
    await page.getByTestId("google-signin").click()
    await expect(page.getByTestId("auth-error")).toContainText(/isn't available yet/i)

    await page.goto("/sign-up")
    await expect(page.getByTestId("google-signup")).toBeVisible()
  })

  test("⚠ an unknown address produces an IDENTICAL sequence of screens (FR-024, SC-012)", async ({
    page,
  }) => {
    // ⚠ WHAT THIS CAN AND CANNOT PROVE, STATED PLAINLY. It cannot prove the SERVER answers identically
    // — that is a live property, and quickstart §3.7 is where a person checks it against a real pool.
    // What it CAN prove, and what no live walk would reliably catch, is that OUR CLIENT contains no
    // existence-dependent branch: given the same response, two different addresses must produce the
    // same screen, the same controls and the same words.
    //
    // That is worth pinning because the branch is easy to add by accident — a well-meaning "we don't
    // recognise that email" would be an account-enumeration oracle on the platform's only public
    // surface, and it would look like a helpfulness improvement in review.
    await page.route("**/cognito-idp.*.amazonaws.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-amz-json-1.1",
        body: JSON.stringify({
          ChallengeName: "CUSTOM_CHALLENGE",
          Session: "stub-session",
          ChallengeParameters: { USERNAME: "stub", destination: "s***@e***.com" },
        }),
      }),
    )

    const seen: string[] = []
    for (const address of ["definitely-a-customer@example.com", "no-such-person@example.com"]) {
      await page.goto("/sign-in")
      await page.getByLabel("Email").fill(address)
      await page.getByTestId("submit-email").click()
      await expect(page.locator("#code")).toBeVisible()

      // The address itself legitimately differs; everything around it must not.
      const body = (await page.locator("main").innerText()).replace(address, "<address>")
      seen.push(body)
    }

    expect(seen[0]).toBe(seen[1])
  })
})
