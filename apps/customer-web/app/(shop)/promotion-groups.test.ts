import { describe, expect, it, vi } from "vitest"

import type { ShopperPromotionDTO } from "@effy/shared-types"

vi.mock("@/lib/api/edge", () => ({ edgeApi: vi.fn(), uncached: vi.fn() }))
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }))
vi.mock("./promotion-groups-public", () => ({ readPublicGroups: vi.fn() }))

import { bannerHref, toGroupBanner } from "./promotion-groups"

const banner: ShopperPromotionDTO = {
  id: "b1",
  kind: "banner",
  headline: "Delivered by Effy in a two-hour window",
  supportingLine: null,
  label: null,
  code: null,
  terms: null,
  endsIn: null,
  target: { kind: "sale" },
}

describe("108 — an information banner on the website", () => {
  it("goes where its target says, never to an offer page", () => {
    expect(toGroupBanner(banner).href).toBe("/search?saleOnly=true")
    expect(bannerHref({ kind: "category", categoryKey: "home-and-kitchen" })).toBe("/search?category=home-and-kitchen")
    expect(bannerHref({ kind: "product", productId: "p1" })).toBe("/product/p1")
    expect(bannerHref({ kind: "search" })).toBe("/search")
  })

  it("is not tappable when its aisle or product has gone", () => {
    expect(toGroupBanner({ ...banner, target: null }).href).toBeNull()
  })

  it("carries no code and no conditions", () => {
    const b = toGroupBanner(banner)
    expect(b.code).toBeNull()
    expect(b.terms).toBeNull()
  })

  it("leaves an offer's link as it was", () => {
    expect(toGroupBanner({ ...banner, kind: "cart", target: { kind: "promotion", promotionId: "b1" } }).href).toBe("/promotions/b1")
  })
})
