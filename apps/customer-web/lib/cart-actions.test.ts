import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CartDTO } from "@effy/shared-types"

import {
  addItem,
  clearAll,
  deleteSavedItem,
  flushPendingCartSends,
  mergeCartAfterSignIn,
  removeItem,
  restoreSavedItem,
  setAsideItem,
  setItemQuantity,
} from "./cart-actions"
import { addToCart as seedGuestLine, readCart, resetCart, type GuestCartLine } from "./cart-store"

const line = (productId: string, quantity = 1, unitPriceAmount = "5.00"): GuestCartLine => ({
  productId,
  name: productId,
  imageUrl: null,
  unitPriceAmount,
  currency: "AUD",
  quantity,
  packageKey: "pkg_a",
})

const dtoLine = (productId: string, quantity: number, over: Record<string, unknown> = {}) => ({
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

const dto = (over: Partial<CartDTO> = {}): CartDTO => ({
  revision: 1,
  lines: [],
  savedLines: [],
  itemSubtotalAmount: "0.00",
  discountAmount: "0.00",
  deliveryFeeAmount: "0.00",
  grandTotalAmount: "0.00",
  currency: "AUD",
  notices: [],
  discount: null,
  checkout: { allowed: false, blockedReason: "empty", minimumSubtotalAmount: null, remainingAmount: null },
  limits: { maxLineQuantity: 99, maxDistinctItems: 100 },
  ...over,
})

interface Call {
  path: string
  method: string
  body: unknown
}

/** Records every request and answers with `status`/`body`, so a test can assert what was SENT. */
function stubFetch(status: number, body?: unknown) {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        path: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body ?? {},
      } as Response
    }),
  )
  return calls
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("cart actions — the mutation reaches the platform", () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetCart()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The scenario that motivated US2: without this send, a cart built here is private to this browser and a
  // second device signing in correctly finds nothing.
  it("sends an add, and adopts the platform's answer", async () => {
    const calls = stubFetch(200, dto({ revision: 6, lines: [dtoLine("p1", 2)], itemSubtotalAmount: "10.00" }))

    addItem(line("p1", 2))
    expect(readCart().lines[0].quantity).toBe(2) // immediately, before any await

    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe("/api/cart/items")
    expect(calls[0].method).toBe("POST")
    expect(calls[0].body).toMatchObject({ productId: "p1", quantity: 2 })
    expect((calls[0].body as { changeId: string }).changeId).toBeTruthy()
    expect(readCart().revision).toBe(6)
  })

  it("sends an ABSOLUTE quantity, which is what makes debouncing safe later", async () => {
    const calls = stubFetch(200, dto({ revision: 2, lines: [dtoLine("p1", 7)] }))

    setItemQuantity("p1", 7)
    flushPendingCartSends() // the stepper is debounced; a test asserting the WIRE must not wait it out
    await flush()

    expect(calls[0].method).toBe("PATCH")
    expect(calls[0].path).toBe("/api/cart/items/p1")
    expect(calls[0].body).toMatchObject({ quantity: 7 })
  })

  it("sends a zero quantity as a removal, not a quantity of zero", async () => {
    const calls = stubFetch(200, dto({ revision: 3 }))

    setItemQuantity("p1", 0)
    flushPendingCartSends()
    await flush()

    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].path).toContain("/api/cart/items/p1")
  })

  it("sends a removal and a clear", async () => {
    const calls = stubFetch(200, dto({ revision: 4 }))

    removeItem("p1")
    await flush()
    clearAll()
    await flush()

    expect(calls.map((c) => `${c.method} ${c.path.split("?")[0]}`)).toEqual([
      "DELETE /api/cart/items/p1",
      "DELETE /api/cart",
    ])
  })

  // 401 is the platform saying "you are a guest" — a normal state, and the mirror is already right.
  it("keeps a guest's change locally when the platform answers 401", async () => {
    stubFetch(401, { error: "authentication required" })

    addItem(line("p1", 3))
    await flush()

    expect(readCart().lines[0].quantity).toBe(3)
  })

  it("keeps the change when the platform cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down")
      }),
    )

    addItem(line("keep", 2))
    await flush()

    expect(readCart().lines[0].quantity).toBe(2)
  })
})

describe("mergeCartAfterSignIn", () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetCart()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends this browser's lines and adopts the union", async () => {
    // The account already held b×3 and c×1; the platform answers with the union, taking the greater b.
    const calls = stubFetch(
      200,
      dto({
        revision: 10,
        lines: [dtoLine("a", 1), dtoLine("b", 3), dtoLine("c", 1)],
        itemSubtotalAmount: "25.00",
      }),
    )
    // Seeded through the STORE, not the actions: before sign-in this shopper was a guest, so their lines
    // were never sent anywhere. Seeding via `addItem` would have adopted the stub's response and made the
    // test assert against a cart the platform had already answered with.
    seedGuestLine(line("a", 1))
    seedGuestLine(line("b", 2))
    calls.length = 0

    expect(await mergeCartAfterSignIn()).toBe(true)

    expect(calls[0].path).toBe("/api/cart/merge")
    expect(calls[0].body).toMatchObject({ lines: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }] })
    expect(readCart().lines.map((l) => l.productId)).toEqual(["a", "b", "c"])
    expect(readCart().lines[1].quantity).toBe(3) // the GREATER, not the sum
  })

  it("reads the account cart when this browser has nothing to contribute", async () => {
    const calls = stubFetch(200, dto({ revision: 4, lines: [dtoLine("theirs", 2)] }))

    expect(await mergeCartAfterSignIn()).toBe(true)

    expect(calls[0].path).toBe("/api/cart")
    expect(calls[0].method).toBe("GET")
    expect(readCart().lines[0].productId).toBe("theirs")
  })

  // ⚠ Clearing first and merging second is how 019's Option B lost carts. It is not coming back.
  it("keeps this browser's cart when the merge fails", async () => {
    stubFetch(502, { error: "unavailable" })
    seedGuestLine(line("mine", 2))

    expect(await mergeCartAfterSignIn()).toBe(false)
    expect(readCart().lines[0].quantity).toBe(2)
  })
})

describe("the quantity stepper is debounced (SC-005)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    resetCart()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("sends ONE request for ten rapid clicks, carrying the settled value", async () => {
    const calls = stubFetch(200, dto({ revision: 2, lines: [dtoLine("p1", 10)] }))
    seedGuestLine(line("p1", 1))

    for (let q = 1; q <= 10; q++) setItemQuantity("p1", q)
    expect(calls).toHaveLength(0) // nothing has gone out yet — the mirror moved, the network did not

    await vi.advanceTimersByTimeAsync(500)

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("PATCH")
    expect(calls[0].body).toMatchObject({ quantity: 10 })
  })

  it("treats a pause as a second intention", async () => {
    const calls = stubFetch(200, dto({ revision: 2 }))
    seedGuestLine(line("p1", 1))

    setItemQuantity("p1", 2)
    await vi.advanceTimersByTimeAsync(500)
    setItemQuantity("p1", 5)
    await vi.advanceTimersByTimeAsync(500)

    expect(calls).toHaveLength(2)
  })

  it("debounces each product independently", async () => {
    const calls = stubFetch(200, dto({ revision: 2 }))
    seedGuestLine(line("p1", 1))
    seedGuestLine(line("p2", 1))

    setItemQuantity("p1", 3)
    setItemQuantity("p2", 4)
    await vi.advanceTimersByTimeAsync(500)

    expect(calls.map((c) => c.path).sort()).toEqual(["/api/cart/items/p1", "/api/cart/items/p2"])
  })

  // A change made a quarter-second before navigating away must not die with the timer.
  it("flush sends a pending change immediately instead of dropping it", async () => {
    const calls = stubFetch(200, dto({ revision: 2 }))
    seedGuestLine(line("p1", 1))

    setItemQuantity("p1", 6)
    expect(calls).toHaveLength(0)

    flushPendingCartSends()
    await vi.advanceTimersByTimeAsync(0)

    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ quantity: 6 })
  })
})

describe("set aside and clear (US6)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetCart()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("moves a line out of the payable cart and into the saved list", async () => {
    const calls = stubFetch(
      200,
      dto({
        revision: 3,
        lines: [dtoLine("keep", 1)],
        savedLines: [dtoLine("aside", 1)],
        itemSubtotalAmount: "5.00",
      }),
    )

    expect(await setAsideItem("aside")).toBe(true)

    expect(calls[0].path).toContain("/api/cart/items/aside/set-aside")
    expect(calls[0].method).toBe("POST")
    expect(readCart().lines.map((l) => l.productId)).toEqual(["keep"])
    expect(readCart().savedLines.map((l) => l.productId)).toEqual(["aside"])
  })

  it("brings a saved line back", async () => {
    const calls = stubFetch(200, dto({ revision: 4, lines: [dtoLine("back", 2)], savedLines: [] }))

    expect(await restoreSavedItem("back")).toBe(true)

    expect(calls[0].path).toContain("/api/cart/saved/back/restore")
    expect(readCart().lines[0].productId).toBe("back")
    expect(readCart().savedLines).toHaveLength(0)
  })

  it("discards a saved line", async () => {
    const calls = stubFetch(200, dto({ revision: 5, savedLines: [] }))

    expect(await deleteSavedItem("gone")).toBe(true)
    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].path).toContain("/api/cart/saved/gone")
  })

  // ⚠ The property a `saved` boolean column would have put one forgotten WHERE clause away.
  it("clearing the cart leaves the saved list alone", async () => {
    stubFetch(200, dto({ revision: 6, lines: [], savedLines: [dtoLine("kept", 1)] }))
    seedGuestLine(line("a", 1))

    clearAll()
    await new Promise((r) => setTimeout(r, 0))

    expect(readCart().lines).toHaveLength(0)
    expect(readCart().savedLines.map((l) => l.productId)).toEqual(["kept"])
  })

  // A guest has no saved list at all — the call 401s and nothing pretends otherwise.
  it("is a no-op for a guest", async () => {
    stubFetch(401, { error: "authentication required" })
    seedGuestLine(line("mine", 1))

    expect(await setAsideItem("mine")).toBe(false)
    expect(readCart().lines.map((l) => l.productId)).toEqual(["mine"])
  })
})
