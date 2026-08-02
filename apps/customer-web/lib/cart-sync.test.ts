import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CartDTO } from "@effy/shared-types"

import { refreshCart } from "./cart-sync"
import { addToCart, readCart, resetCart, type GuestCartLine } from "./cart-store"

const line = (productId: string, quantity = 1, unitPriceAmount = "5.00"): GuestCartLine => ({
  productId,
  name: productId,
  imageUrl: null,
  unitPriceAmount,
  currency: "AUD",
  quantity,
  packageKey: "pkg_a",
})

const dto = (over: Partial<CartDTO> = {}): CartDTO => ({
  revision: 1,
  lines: [],
  savedLines: [],
  itemSubtotalAmount: "0.00",
  discountAmount: "0.00",
  grandTotalAmount: "0.00",
  currency: "AUD",
  notices: [],
  discount: null,
  checkout: { allowed: false, blockedReason: "empty", minimumSubtotalAmount: null, remainingAmount: null },
  limits: { maxLineQuantity: 99, maxDistinctItems: 100 },
  ...over,
})

const dtoLine = (productId: string, quantity: number, over: Partial<CartDTO["lines"][number]> = {}) => ({
  id: `line-${productId}`,
  productId,
  name: productId,
  imageUrl: null,
  unitPriceAmount: "5.00",
  quantity,
  lineSubtotalAmount: "5.00",
  available: true,
  priceChangedFrom: null,
  packageKey: "pkg_a",
  ...over,
})

/** A `fetch` stub keyed by path, so a test states exactly which endpoint answered what. */
function stubFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      calls.push(path)
      const match = Object.keys(routes).find((r) => path.startsWith(r))
      const route = match ? routes[match] : { status: 404 }
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        json: async () => route.body ?? {},
      } as Response
    }),
  )
  return calls
}

describe("refreshCart", () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetCart()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("adopts the account cart for a signed-in shopper", async () => {
    stubFetch({ "/api/cart": { status: 200, body: dto({ revision: 4, lines: [dtoLine("p1", 2)], itemSubtotalAmount: "10.00" }) } })

    expect(await refreshCart()).toBe(true)
    expect(readCart().revision).toBe(4)
    expect(readCart().lines[0].productId).toBe("p1")
  })

  // 401 is not a failure here — it is the platform answering "you are a guest", and the guest path is
  // what makes FR-004 true for someone who has no server cart.
  it("falls through to preview when /api/cart says 401 (a guest)", async () => {
    addToCart(line("p1", 1, "5.00"))
    const calls = stubFetch({
      "/api/cart/preview": {
        status: 200,
        body: dto({ revision: 0, lines: [dtoLine("p1", 1, { unitPriceAmount: "6.50" })], itemSubtotalAmount: "6.50" }),
      },
      "/api/cart": { status: 401, body: { error: "authentication required" } },
    })

    expect(await refreshCart()).toBe(true)
    expect(calls.some((c) => c.includes("/api/cart/preview"))).toBe(true)
    expect(readCart().lines[0].unitPriceAmount).toBe("6.50")
  })

  it("does not spend a request previewing an empty guest cart", async () => {
    const calls = stubFetch({ "/api/cart": { status: 401 } })

    expect(await refreshCart()).toBe(false)
    expect(calls.filter((c) => c.includes("preview"))).toHaveLength(0)
  })

  // ⚠ The rule that matters most: a failed check must never read as "your cart is empty".
  it("keeps the cart when the platform cannot be reached at all", async () => {
    addToCart(line("keep", 3))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down")
      }),
    )

    expect(await refreshCart()).toBe(false)
    expect(readCart().lines).toHaveLength(1)
    expect(readCart().lines[0].quantity).toBe(3)
  })

  it("keeps the cart when the preview itself fails", async () => {
    addToCart(line("keep", 2))
    stubFetch({
      "/api/cart/preview": { status: 502, body: { error: "unavailable" } },
      "/api/cart": { status: 401 },
    })

    expect(await refreshCart()).toBe(false)
    expect(readCart().lines[0].quantity).toBe(2)
  })

  // A restored cart must show today's availability, not the availability it was built with.
  it("brings back an item having gone unavailable, flagged and excluded from the total", async () => {
    addToCart(line("gone", 1, "5.00"))
    stubFetch({
      "/api/cart/preview": {
        status: 200,
        body: dto({
          revision: 0,
          lines: [dtoLine("gone", 1, { available: false })],
          itemSubtotalAmount: "0.00",
          notices: [{ productId: "gone", kind: "unavailable", detail: "gone" }],
          checkout: {
            allowed: false,
            blockedReason: "no_payable_items",
            minimumSubtotalAmount: null,
            remainingAmount: null,
          },
        }),
      },
      "/api/cart": { status: 401 },
    })

    await refreshCart()

    const cart = readCart()
    expect(cart.lines[0].available).toBe(false)
    expect(cart.itemSubtotalAmount).toBe("0.00")
    expect(cart.checkout.allowed).toBe(false)
    expect(cart.notices[0].kind).toBe("unavailable")
  })

  it("ignores an out-of-order account response", async () => {
    stubFetch({ "/api/cart": { status: 200, body: dto({ revision: 9, lines: [dtoLine("new", 1)] }) } })
    await refreshCart()

    vi.unstubAllGlobals()
    stubFetch({ "/api/cart": { status: 200, body: dto({ revision: 3, lines: [dtoLine("stale", 1)] }) } })

    expect(await refreshCart()).toBe(false)
    expect(readCart().lines[0].productId).toBe("new")
  })
})
