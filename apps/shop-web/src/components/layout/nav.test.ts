import { visibleNav } from "@effy/web-kit/console";
import { describe, expect, it } from "vitest";

import { NAV } from "./nav";

// Role-aware nav (FR-007), asserted against THIS surface's config. The Management item must
// reflect the authoritative backend gate: visible only to a store_manager, hidden from store_staff
// and role-less operators. (The `visibleNav` filter itself is tested in @effy/web-kit.)
describe("shop-web nav (role-aware)", () => {
  it("always shows the ungated Dashboard item", () => {
    for (const roles of [["store_manager"], ["store_staff"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/");
    }
  });

  it("shows the Management item only to a store manager", () => {
    expect(visibleNav(NAV, ["store_manager"]).map((i) => i.to)).toContain("/manager");
    expect(visibleNav(NAV, ["store_staff", "store_manager"]).map((i) => i.to)).toContain("/manager");
  });

  it("hides the Management item from store_staff and role-less operators", () => {
    expect(visibleNav(NAV, ["store_staff"]).map((i) => i.to)).not.toContain("/manager");
    expect(visibleNav(NAV, []).map((i) => i.to)).not.toContain("/manager");
  });
});
