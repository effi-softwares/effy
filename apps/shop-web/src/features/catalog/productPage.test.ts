import { describe, expect, it } from "vitest"

import type { ProductDetail } from "./model"
import { shopPreviewSizes } from "./productPage"

const stock = { tracked: true, onHand: 5, threshold: null, effectiveThreshold: null, outOfStock: false, low: false }
const size = (id: string, label: string, shop: string, customer: string) => ({
  id,
  label,
  code: `V${id}`,
  sku: null,
  gtin: null,
  shopPriceAmount: shop,
  customerPriceAmount: customer,
  weightGrams: 500,
  weightIsAssumed: false,
  packQuantity: null,
  packUnit: null,
  state: "active",
  stock: { ...stock, variantId: id },
})

const DETAIL = {
  id: "p1",
  name: "Olive oil",
  currency: "AUD",
  status: "active",
  reviewState: "live",
  unitBasis: null,
  options: [{ id: "o1" }],
  variants: [size("a", "375 mL", "9.50", "10.45"), size("b", "750 mL", "16.00", "17.60")],
  pendingChange: null,
} as unknown as ProductDetail

describe("the preview's prices (it follows the product as edited)", () => {
  it("shows what customers pay for a size nobody is changing", () => {
    const [a] = shopPreviewSizes(DETAIL, null)
    expect(a).toMatchObject({ price: "AUD 10.45" })
    expect(a!.priceNote).toBeUndefined()
  })

  it("follows a price typed in the spreadsheet before it is saved, as the shop's own price", () => {
    const [, b] = shopPreviewSizes(DETAIL, { a: "9.50", b: "18" })
    expect(b).toMatchObject({ price: "AUD 18.00", priceNote: expect.stringMatching(/your price/i) })
  })

  it("shows a price waiting for Effy the same way", () => {
    const pending = {
      ...DETAIL,
      reviewState: "live_change_pending",
      pendingChange: { state: "in_review", proposed: { variants: [{ id: "b", shopPriceAmount: "17.00" }] } },
    } as unknown as ProductDetail
    expect(shopPreviewSizes(pending, null)[1]).toMatchObject({ price: "AUD 17.00" })
  })

  it("shows the shop's price on a product never approved, and nothing for a price that is not one", () => {
    const draft = { ...DETAIL, reviewState: "draft", status: "draft" } as unknown as ProductDetail
    expect(shopPreviewSizes(draft, null)[0]).toMatchObject({ price: "AUD 9.50" })
    expect(shopPreviewSizes(DETAIL, { a: "nine" })[0]!.price).toBeNull()
  })
})
