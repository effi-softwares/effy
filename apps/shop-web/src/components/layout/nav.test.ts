import { visibleNav } from "@effy/web-kit/console";
import { describe, expect, it } from "vitest";

import { NAV } from "./nav";

// Role-aware nav (FR-007), asserted against THIS surface's config. The Management item must
// reflect the authoritative backend gate: visible only to a shop_manager, hidden from shop_staff
// and role-less operators. (The `visibleNav` filter itself is tested in @effy/web-kit.)
describe("shop-web nav (role-aware)", () => {
  it("always shows the ungated Dashboard item", () => {
    for (const roles of [["shop_manager"], ["shop_staff"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/");
    }
  });

  it("shows the Management item only to a shop manager", () => {
    expect(visibleNav(NAV, ["shop_manager"]).map((i) => i.to)).toContain("/manager");
    expect(visibleNav(NAV, ["shop_staff", "shop_manager"]).map((i) => i.to)).toContain("/manager");
  });

  // FR-019a — fulfilment is role-agnostic: the staff standing at the shelves are its primary users,
  // and the backend admits shop_manager AND shop_staff. Gating Orders would hide the work from the
  // people who do it.
  it("shows Orders to every shop role, ungated", () => {
    for (const roles of [["shop_manager"], ["shop_staff"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/orders");
    }
    expect(NAV.find((i) => i.to === "/orders")?.requiredRole).toBeUndefined();
  });

  it("hides the Management item from shop_staff and role-less operators", () => {
    expect(visibleNav(NAV, ["shop_staff"]).map((i) => i.to)).not.toContain("/manager");
    expect(visibleNav(NAV, []).map((i) => i.to)).not.toContain("/manager");
  });
});
