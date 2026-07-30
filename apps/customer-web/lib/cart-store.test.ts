import { beforeEach, describe, expect, it } from "vitest"

import type { CartDTO } from "@effy/shared-types"

import {
  addLine,
  addToCart,
  adopt,
  adoptPreview,
  cartCount,
  resetCart,
  setCartQty,
  groupByPackage,
  linePayload,
  removeLine,
  setLineQty,
  type GuestCartLine,
} from "./cart-store"

const line = (productId: string, quantity: number, packageKey = "pkg_a"): GuestCartLine => ({
  productId,
  name: productId,
  imageUrl: null,
  unitPriceAmount: "5.00",
  currency: "AUD",
  quantity,
  packageKey,
})

describe("addLine", () => {
  it("adds a new line", () => {
    expect(addLine([], line("a", 2))).toHaveLength(1)
  })

  it("merges quantity for an existing product", () => {
    const result = addLine([line("a", 2)], line("a", 3))
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(5)
  })

  it("clamps merged quantity at 99", () => {
    expect(addLine([line("a", 90)], line("a", 20))[0].quantity).toBe(99)
  })

  it("clamps a new line to at least 1", () => {
    expect(addLine([], line("a", 0))[0].quantity).toBe(1)
  })
})

describe("setLineQty", () => {
  it("updates the quantity", () => {
    expect(setLineQty([line("a", 1)], "a", 4)[0].quantity).toBe(4)
  })
  it("removes the line at quantity 0", () => {
    expect(setLineQty([line("a", 1)], "a", 0)).toHaveLength(0)
  })
})

describe("removeLine", () => {
  it("drops the matching product", () => {
    expect(removeLine([line("a", 1), line("b", 1)], "a")).toEqual([line("b", 1)])
  })
})

describe("cartCount", () => {
  it("sums quantities", () => {
    expect(cartCount([line("a", 2), line("b", 3)])).toBe(5)
  })
})

describe("linePayload", () => {
  it("projects to productId + quantity", () => {
    expect(linePayload([line("a", 2)])).toEqual([{ productId: "a", quantity: 2 }])
  })
})

describe("groupByPackage", () => {
  it("keeps a single-key cart as one package (no artificial split)", () => {
    const packages = groupByPackage([line("a", 1), line("b", 1)])
    expect(packages).toHaveLength(1)
    expect(packages[0].lines.map((l) => l.productId)).toEqual(["a", "b"])
  })

  it("splits distinct keys into packages in first-appearance order", () => {
    const packages = groupByPackage([
      line("a", 1, "pkg_x"),
      line("b", 1, "pkg_y"),
      line("c", 1, "pkg_x"),
    ])
    expect(packages).toHaveLength(2)
    expect(packages[0].packageKey).toBe("pkg_x")
    expect(packages[0].lines.map((l) => l.productId)).toEqual(["a", "c"])
    expect(packages[1].packageKey).toBe("pkg_y")
    expect(packages[1].lines.map((l) => l.productId)).toEqual(["b"])
  })

  it("returns nothing for an empty cart", () => {
    expect(groupByPackage([])).toEqual([])
  })
})

/* ── The mirror (027) ─────────────────────────────────────────────────────────────────────────── */

describe("the cart mirror — persistence and adoption", () => {
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

  beforeEach(() => {
    window.localStorage.clear()
    resetCart()
  })

  it("survives a reload — the defect this slice exists to fix", () => {
    addToCart(line("a", 2))
    // A fresh read with the module's cache defeated, exactly as a new page load would do.
    const raw = window.localStorage.getItem("effy:cart:v2")
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).cart.lines[0].quantity).toBe(2)
  })

  it("migrates a 019-shaped cart rather than emptying it on deploy", () => {
    window.localStorage.clear()
    window.localStorage.setItem("effy:cart", JSON.stringify([line("legacy", 3)]))
    // First touch after the upgrade.
    setCartQty("legacy", 3)
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!)
    expect(stored.cart.lines.map((l: GuestCartLine) => l.productId)).toEqual(["legacy"])
    expect(window.localStorage.getItem("effy:cart")).toBeNull()
  })

  it("adopts a newer platform cart", () => {
    expect(adopt(dto({ revision: 5, lines: [dtoLine("p9", 1)], itemSubtotalAmount: "5.00" }))).toBe(true)
  })

  // The out-of-order response: a slow reply to an old change must not undo a newer one.
  it("REJECTS an older revision so a stale cart cannot win", () => {
    adopt(dto({ revision: 9, lines: [dtoLine("new", 1)] }))
    expect(adopt(dto({ revision: 4, lines: [dtoLine("stale", 1)] }))).toBe(false)
  })

  it("takes guest preview prices without needing a newer revision", () => {
    adopt(dto({ revision: 4, lines: [dtoLine("p1", 1)] }))
    adoptPreview(dto({ revision: 0, lines: [dtoLine("p1", 1, { unitPriceAmount: "6.50" })] }))
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!)
    expect(stored.cart.lines[0].unitPriceAmount).toBe("6.50")
    expect(stored.cart.revision).toBe(4)
  })

  it("drops a discount the platform has not re-approved against the changed cart", () => {
    adopt(
      dto({
        revision: 2,
        lines: [dtoLine("p1", 2)],
        itemSubtotalAmount: "10.00",
        discountAmount: "2.00",
        grandTotalAmount: "8.00",
        discount: { code: "SPRING20", kind: "percentage", amount: "2.00", label: "20% off" },
      }),
    )
    setCartQty("p1", 1)
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!).cart
    expect(stored.discount).toBeNull()
    expect(stored.discountAmount).toBe("0.00")
    expect(stored.grandTotalAmount).toBe("5.00")
  })

  it("excludes an unavailable line from the subtotal", () => {
    addToCart(line("ok", 1))
    addToCart({ ...line("gone", 1), available: false, unitPriceAmount: "3.00" })
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!).cart
    expect(stored.itemSubtotalAmount).toBe("5.00")
    expect(stored.checkout.allowed).toBe(true)
  })

  it("blocks checkout when nothing is payable", () => {
    addToCart({ ...line("gone", 1), available: false })
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!).cart
    expect(stored.checkout.allowed).toBe(false)
    expect(stored.checkout.blockedReason).toBe("no_payable_items")
  })

  it("keeps a platform below-minimum block through a local edit", () => {
    adopt(
      dto({
        revision: 1,
        lines: [dtoLine("p1", 1)],
        itemSubtotalAmount: "5.00",
        checkout: {
          allowed: false,
          blockedReason: "below_minimum",
          minimumSubtotalAmount: "25.00",
          remainingAmount: "20.00",
        },
      }),
    )
    addToCart(line("p1", 1))
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!).cart
    expect(stored.checkout.blockedReason).toBe("below_minimum")
    expect(stored.checkout.allowed).toBe(false)
  })

  it("discards an unknown schema version instead of trusting it", () => {
    window.localStorage.setItem("effy:cart:v2", JSON.stringify({ version: 999, cart: { lines: [line("x", 1)] } }))
    addToCart(line("y", 1))
    const stored = JSON.parse(window.localStorage.getItem("effy:cart:v2")!).cart
    expect(stored.lines.map((l: GuestCartLine) => l.productId)).toEqual(["y"])
  })

  it("survives corrupt JSON without throwing", () => {
    window.localStorage.setItem("effy:cart:v2", "{not json")
    expect(() => addToCart(line("z", 1))).not.toThrow()
  })
})
