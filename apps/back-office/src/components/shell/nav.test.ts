import { describe, expect, it } from "vitest"

import type { BackOfficeRole } from "@effy/shared-types"
import { railLabelOf, railLabelProblems } from "@effy/web-kit/console"

import { activeKey, DEFAULT_TAB, locate, NAV_GROUPS, visibleGroups, type NavGroup } from "./nav"

const ROLE_SETS: readonly (readonly BackOfficeRole[])[] = [["admin"], ["manager"], ["csa"], []]

const leafPaths = (groups: readonly NavGroup[]) =>
  groups.flatMap((g) => g.items.flatMap((i) => (i.subs ?? [i]).map((l) => l.to)))

describe("back-office sidebar - who sees what", () => {
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
        "/settings",
        "/settings/delivery/coverage",
        "/settings/hub",
        "/settings/drivers",
        "/settings/order-rules",
        "/settings/points",
        "/deliverability",
      ]) {
        expect(paths, `${to} for [${roles.join(",")}]`).toContain(to)
      }
    }
  })

  it("shows Tax and Team and access only to an administrator", () => {
    for (const to of ["/settings/tax", "/settings/team"]) {
      expect(leafPaths(visibleGroups(NAV_GROUPS, ["admin"]))).toContain(to)
      expect(leafPaths(visibleGroups(NAV_GROUPS, ["manager", "admin"]))).toContain(to)
      for (const roles of [["manager"], ["csa"], []] as const) {
        expect(leafPaths(visibleGroups(NAV_GROUPS, roles))).not.toContain(to)
      }
    }
  })

  it("groups the rail by the job: Operations · People · Catalogue · Settings", () => {
    expect(visibleGroups(NAV_GROUPS, ["admin"]).map((g) => g.label)).toEqual([
      "Operations",
      "People",
      "Catalogue",
      "Settings",
    ])
  })

  it("puts every page that configures the platform under Settings, and nothing else", () => {
    const settings = (roles: readonly BackOfficeRole[]) =>
      visibleGroups(NAV_GROUPS, roles)
        .find((g) => g.label === "Settings")
        ?.items.flatMap((i) => (i.subs ?? [i]).map((s) => s.key))
    expect(settings(["admin"])).toEqual([
      "coverage",
      "courier-delivery",
      "pricing",
      "windows",
      "days",
      "hub",
      "driver-work",
      "order-rules",
      "points",
      "notifications",
      "tax",
      "team",
      "housekeeping",
      // The index comes last.
      "settings",
    ])
    // A manager or csa still has Settings, without the admin-only pages.
    expect(settings(["manager"])).not.toContain("tax")
    expect(settings(["csa"])).not.toContain("team")
  })

  it("files Email deliverability with the people it is about, not under Settings", () => {
    const customers = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === "customers-group")
    expect(customers?.subs?.map((s) => s.key)).toContain("deliverability")
  })
})

describe("back-office sidebar - which page is lit", () => {
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
    expect(key("/settings/order-rules")).toBe("order-rules")
    expect(key("/promotions/abc")).toBe("promotions")
  })

  it("lights the one settings page, and All settings only on the index", () => {
    expect(key("/settings")).toBe("settings")
    expect(key("/settings/delivery/coverage")).toBe("coverage")
    expect(key("/settings/delivery/pricing")).toBe("pricing")
    expect(key("/settings/hub")).toBe("hub")
    expect(key("/settings/drivers")).toBe("driver-work")
    expect(key("/settings/points")).toBe("points")
    expect(key("/settings/team")).toBe("team")
  })

  it("a customer record belongs to Customers", () => {
    expect(key("/customers")).toBe("customers")
    expect(key("/customers/abc")).toBe("customers")
    expect(DEFAULT_TAB["/customers"]).toBe("customers")
  })

  it("finds a leaf's group and entry for the breadcrumb", () => {
    const where = locate(NAV_GROUPS, "dispatch")
    expect(where?.group.label).toBe("Operations")
    expect(where?.item.label).toBe("Orders")
    expect(where?.leaf.label).toBe("Dispatch")
  })
})

describe("the folded rail", () => {
  it("every entry's name fits it, broken only between words", () => {
    const all = NAV_GROUPS.flatMap((g) => g.items)
    expect(all.flatMap((e) => railLabelProblems(railLabelOf(e)))).toEqual([])
  })
})
