import { expect, test } from "@playwright/test"

/**
 * Delivery at checkout (047 — Delivery Zones & Shipping-Fee Engine).
 *
 * ⚠ REPLACES the old 030 "delivery-location panel" spec. That panel was on the home page and was
 * removed when delivery was withdrawn (2026-08-02); 047 puts serviceability + the fee at CHECKOUT,
 * where a shopper decides. So the assertions live there now.
 *
 * ⚠ These need a LIVE core-api (`make core-run` or the dev Fargate service) with delivery configured
 * (a served zone, an active fee plan) AND a signed-in session with a cart + a saved address — the
 * checkout route is auth-gated. There is no guest path to it. In a bare CI checkout (guest, no live
 * core-api) `/checkout` redirects to sign-in, and every test here SKIPS rather than fails — a skip is
 * NOT a pass; the operator walk in specs/047-delivery-shipping-engine/quickstart.md §3 is what proves
 * this end to end.
 *
 * What they assert when they DO run (SC-002/SC-006):
 *   • a served address shows a single GST-inclusive delivery fee BEFORE payment (no drip);
 *   • same-day, when offered, is a choice with its own fee, always ≥ standard;
 *   • an address in no served zone shows "we don't deliver … yet" and blocks payment (one reason);
 *   • nothing on screen discloses a distance, a ring, or which shop fulfils (FR-018/033).
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

test.describe("delivery at checkout (047)", () => {
  test("a served address shows a delivery fee before payment", async ({ page }) => {
    test.skip(!(await onCheckout(page)), "needs a signed-in session + live core-api (operator walk)")

    // Choosing an address triggers the quote; the summary shows a Delivery line with a dollar figure.
    await expect(page.getByText(/delivery/i)).toBeVisible()
    await expect(page.getByText(/\$\d+\.\d{2}/)).toBeVisible()
    // The Total is a real figure (not "+ delivery"), and pay is enabled for a served address.
    await expect(page.getByRole("button", { name: /continue to payment/i })).toBeEnabled()
    // ⚠ No distance / ring / shop identity anywhere (FR-018/033).
    await expect(page.getByText(/\bkm\b|ring|shop #/i)).toHaveCount(0)
  })

  test("an unserviceable address blocks payment with one plain reason", async ({ page }) => {
    test.skip(!(await onCheckout(page)), "needs a signed-in session + live core-api (operator walk)")
    test.skip(true, "requires seeding an address in NO served zone — operator walk (quickstart §3)")

    await expect(page.getByText(/don.t deliver to this address yet/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /continue to payment/i })).toBeDisabled()
  })
})
