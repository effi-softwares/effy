import { expect, test } from "@playwright/test"

/**
 * 027 — the cart survives, re-prices, and refuses honestly.
 *
 * These are the promises unit tests cannot reach, because each one is a property of the BROWSER
 * rather than of a function:
 *
 *   • SC-001 — a cart built before a reload is still there after it. The mirror lives in
 *     `localStorage`; only a real reload proves it is read back rather than re-derived from a
 *     module-level variable that happens to survive a Vitest run.
 *   • FR-004 — the cart re-prices on open. A stale price is invisible in a unit test, because the
 *     fake repository always answers with today's data.
 *   • FR-026/FR-054 — checkout is offered only when the PLATFORM says so, and the reason is stated.
 *   • FR-041/FR-043 — a promotional code is judged server-side and its refusal is specific.
 *
 * ⚠ These run as a GUEST. The signed-in half (the sign-in merge, a real promo redemption) needs a
 * Cognito session and a seeded catalogue, and is walked by the operator per quickstart §3 — asserting
 * it here would mean faking the very boundary the slice exists to get right.
 */

test.use({ storageState: { cookies: [], origins: [] } })

/** Put the first product on /search into the cart and return to the cart page. */
async function addFirstProduct(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/search")
  const add = page.getByRole("button", { name: /add to cart/i }).first()
  await add.click()
  await page.goto("/cart")
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible()
}

test.describe("the cart survives the browser (SC-001)", () => {
  test("a cart built before a reload is still there after it", async ({ page }) => {
    await addFirstProduct(page)
    const lines = await page.getByRole("listitem").count()
    expect(lines).toBeGreaterThan(0)

    await page.reload()

    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible()
    expect(await page.getByRole("listitem").count()).toBe(lines)
  })

  test("a cart built in one tab is present in a second tab opened from the same browser", async ({
    context,
    page,
  }) => {
    await addFirstProduct(page)

    const second = await context.newPage()
    await second.goto("/cart")
    await expect(second.getByRole("heading", { name: "Your cart" })).toBeVisible()
    await expect(second.getByRole("listitem").first()).toBeVisible()
    await second.close()
  })

  test("an emptied cart stays empty across a reload — clearing is not a render-time illusion", async ({
    page,
  }) => {
    await addFirstProduct(page)
    // Remove every line via the row's own control.
    const removers = page.getByRole("button", { name: /remove/i })
    for (let i = await removers.count(); i > 0; i--) await removers.first().click()

    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible()
  })
})

test.describe("the cart re-prices on open (FR-004)", () => {
  test("opening the cart asks the platform to price it, rather than trusting stored prices", async ({
    page,
  }) => {
    await addFirstProduct(page)

    // The preview call is what makes a restored cart show TODAY's prices. Assert it HAPPENS —
    // a cart that renders stored numbers looks identical and is wrong.
    const preview = page.waitForRequest((r) => r.url().includes("/api/cart/preview"), {
      timeout: 10_000,
    })
    await page.reload()
    expect((await preview).method()).toBe("POST")
  })

  test("a failed re-price leaves the cart alone — 'we could not check' must not read as 'you have nothing'", async ({
    page,
  }) => {
    await addFirstProduct(page)
    const before = await page.getByRole("listitem").count()

    await page.route("**/api/cart/preview", (route) => route.abort())
    await page.reload()

    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible()
    expect(await page.getByRole("listitem").count()).toBe(before)
  })
})

test.describe("checkout is gated by the platform, not the client (FR-026/FR-054)", () => {
  test("an empty cart never offers checkout", async ({ page }) => {
    await page.goto("/cart")
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible()
    await expect(page.getByRole("link", { name: /go to checkout/i })).toHaveCount(0)
  })

  test("a blocked cart states its reason rather than silently disabling the button", async ({
    page,
  }) => {
    await addFirstProduct(page)

    // Force the platform's answer to "below minimum" and confirm the page renders ITS reason —
    // the client never invents this text, and never decides the gate.
    await page.route("**/api/cart/preview", async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.checkout = {
        allowed: false,
        blockedReason: "below_minimum",
        minimumSubtotalAmount: "50.00",
        remainingAmount: "37.50",
      }
      await route.fulfill({ response: res, json: body })
    })
    await page.reload()

    await expect(page.getByText(/reach the .*50\.00 minimum/i)).toBeVisible()
    await expect(page.getByText(/37\.50/)).toBeVisible()
    await expect(page.getByRole("link", { name: /go to checkout/i })).toHaveCount(0)
  })
})

test.describe("a promotional code is judged by the platform (FR-041/FR-042/FR-043)", () => {
  test("a guest is asked to sign in rather than shown a discount that could be withdrawn", async ({
    page,
  }) => {
    await addFirstProduct(page)

    const field = page.getByLabel(/promotional code/i)
    // The field may be hidden entirely for a guest — either is a correct answer to FR-041, but
    // "type a code and see a discount" is not.
    if (await field.count()) {
      await field.fill("SPRING20")
      await page.getByRole("button", { name: /apply/i }).click()
      await expect(page.getByText(/sign in/i)).toBeVisible()
    }
    await expect(page.getByText(/% off/)).toHaveCount(0)
  })

  test("a refusal states WHICH reason — 'that code doesn't work' is not an answer", async ({
    page,
  }) => {
    await addFirstProduct(page)
    const field = page.getByLabel(/promotional code/i)
    test.skip((await field.count()) === 0, "the promo field is signed-in only on this surface")

    await page.route("**/api/cart/promo", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "https://effyshopping.com/problems/promo-expired",
          title: "Validation failed",
          detail: "That code has expired.",
        }),
      }),
    )

    await field.fill("EXPIRED")
    await page.getByRole("button", { name: /apply/i }).click()
    await expect(page.getByText(/expired/i)).toBeVisible()
  })
})
