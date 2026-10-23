import { expect, test } from "@playwright/test"

/**
 * Delivery at checkout. Needs a live backend with delivery configured and a signed-in session with a cart
 * and a saved address; without them every test skips (a skip is not a pass). Nothing on screen may
 * disclose a distance or which shop fulfils.
 */

/** True when we landed on the checkout form (signed in) rather than being bounced to sign-in. */
async function onCheckout(page: import("@playwright/test").Page): Promise<boolean> {
  await page.goto("/checkout").catch(() => {})
  // The order summary heading only renders on the real checkout form.
  return page
    .getByRole("heading", { name: /order summary/i })
    .isVisible()
    .catch(() => false)
}

test.describe("delivery at checkout", () => {
  test("a served address shows a delivery fee before payment", async ({ page }) => {
    test.skip(!(await onCheckout(page)), "needs a signed-in session + live backend (operator walk)")

    // Choosing an address triggers the quote; the summary shows a Delivery line with a dollar figure.
    await expect(page.getByText(/delivery/i)).toBeVisible()
    await expect(page.getByText(/\$\d+\.\d{2}/)).toBeVisible()
    // The Total is a real figure (not "+ delivery"), and pay is enabled for a served address.
    await expect(page.getByRole("button", { name: /continue to payment/i })).toBeEnabled()
    // No distance / ring / shop identity anywhere.
    await expect(page.getByText(/\bkm\b|ring|shop #/i)).toHaveCount(0)
  })
})
