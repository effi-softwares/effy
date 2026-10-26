import { describe, expect, it } from "vitest"

import type { BackOfficeRole } from "@effy/shared-types"

import { activeKey, DEFAULT_TAB, locate, NAV_GROUPS, visibleGroups, type NavGroup } from "./nav"

const ROLE_SETS: readonly (readonly BackOfficeRole[])[] = [["admin"], ["manager"], ["csa"], []]

const leafPaths = (groups: readonly NavGroup[]) =>
  groups.flatMap((g) => g.items.flatMap((i) => (i.subs ?? [i]).map((l) => l.to)))

describe("back-office sidebar — who sees what", () => {
  it("shows every operational page to every role, csa included", () => {
    for (const roles of ROLE_SETS) {
      const paths = leafPaths(visibleGroups(NAV_GROUPS, roles))
      for (const to of [
        "/",
        "/orders",
        "/orders/assignments",
        "/exceptions",
        "/customers",
        "/drivers",
        "/shops",
        "/taxonomy",
        "/delivery",
      ]) {
        expect(paths, `${to} for [${roles.join(",")}]`).toContain(to)
      }
    }
  })

  it("shows Admin and access only to an administrator", () => {
    expect(leafPaths(visibleGroups(NAV_GROUPS, ["admin"]))).toContain("/admin")
    expect(leafPaths(visibleGroups(NAV_GROUPS, ["manager", "admin"]))).toContain("/admin")
    for (const roles of [["manager"], ["csa"], []] as const) {
      expect(leafPaths(visibleGroups(NAV_GROUPS, roles))).not.toContain("/admin")
    }
  })

  it("groups the rail by the job: Operations · People · Catalogue · Setup", () => {
    expect(visibleGroups(NAV_GROUPS, ["admin"]).map((g) => g.label)).toEqual([
      "Operations",
      "People",
      "Catalogue",
      "Setup",
    ])
  })

  it("keeps the set-and-leave pages under one Settings entry, gated per page", () => {
    const settings = (roles: readonly BackOfficeRole[]) =>
      visibleGroups(NAV_GROUPS, roles)
        .flatMap((g) => g.items)
        .find((i) => i.key === "settings-group")
        ?.subs?.map((s) => s.key)
    expect(settings(["admin"])).toEqual(["points", "tax", "deliverability", "admin"])
    // A manager or csa still has Settings, without the admin-only pages.
    expect(settings(["manager"])).toEqual(["points", "deliverability"])
    expect(settings(["csa"])).toEqual(["points", "deliverability"])
  })
})

describe("back-office sidebar — which page is lit", () => {
  const key = (pathname: string, tab?: string) => activeKey(NAV_GROUPS, { pathname, tab })

  it("lights Overview only on the root", () => {
    expect(key("/")).toBe("overview")
    expect(key("/orders")).not.toBe("overview")
  })

  it("prefers the most specific page (Dispatch over All orders)", () => {
    expect(key("/orders")).toBe("orders")
    expect(key("/orders/assignments")).toBe("dispatch")
    expect(key("/orders/assignments/rounds/abc")).toBe("dispatch")
    expect(key("/orders/handover")).toBe("courier")
    expect(key("/orders/0b6f1c2e-0000-0000-0000-000000000000")).toBe("orders")
    expect(key("/promotions/order-rules")).toBe("order-rules")
    expect(key("/promotions/abc")).toBe("promotions")
  })

  it("lights exactly one Delivery tab, Coverage when the URL names none", () => {
    expect(key("/delivery")).toBe("coverage")
    expect(key("/delivery", "pricing")).toBe("pricing")
    expect(DEFAULT_TAB["/delivery"]).toBe("coverage")
  })

  it("tells Customers from Points settings by the tab, and a customer record belongs to Customers", () => {
    expect(key("/customers")).toBe("customers")
    expect(key("/customers", "settings")).toBe("points")
    expect(key("/customers/abc")).toBe("customers")
  })

  it("finds a leaf's group and entry for the breadcrumb", () => {
    const where = locate(NAV_GROUPS, "dispatch")
    expect(where?.group.label).toBe("Operations")
    expect(where?.item.label).toBe("Orders")
    expect(where?.leaf.label).toBe("Dispatch")
  })
})
