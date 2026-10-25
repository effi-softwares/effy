import { visibleNav } from "@effy/web-kit/console"
import { describe, expect, it } from "vitest"

import { NAV } from "./nav"

describe("shop-web nav (role-aware)", () => {
  it("always shows the ungated Dashboard item", () => {
    for (const roles of [["shop_manager"], ["shop_staff"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/")
    }
  })

  it("shows the Management item only to a shop manager", () => {
    expect(visibleNav(NAV, ["shop_manager"]).map((i) => i.to)).toContain("/manager")
    expect(visibleNav(NAV, ["shop_staff", "shop_manager"]).map((i) => i.to)).toContain("/manager")
  })

  it("shows Orders to every shop role, ungated", () => {
    for (const roles of [["shop_manager"], ["shop_staff"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/orders")
    }
    expect(NAV.find((i) => i.to === "/orders")?.requiredRole).toBeUndefined()
  })

  it("offers no Restock item to anyone", () => {
    expect(NAV.map((i) => i.to)).not.toContain("/restock")
    expect(NAV.map((i) => i.label)).not.toContain("Restock")
  })

  it("hides the Management item from shop_staff and role-less operators", () => {
    expect(visibleNav(NAV, ["shop_staff"]).map((i) => i.to)).not.toContain("/manager")
    expect(visibleNav(NAV, []).map((i) => i.to)).not.toContain("/manager")
  })
})
