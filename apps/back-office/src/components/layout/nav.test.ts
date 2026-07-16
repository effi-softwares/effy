import { visibleNav } from "@effy/web-kit/console";
import { describe, expect, it } from "vitest";

import { NAV } from "./nav";

// Role-aware nav (Amendment D1 / FR-023 / SC-013), asserted against THIS surface's config. The
// Admin item must reflect the authoritative backend gate: visible only to an admin, hidden for
// manager/csa/role-less accounts. (The `visibleNav` filter itself is tested in @effy/web-kit.)
describe("back-office nav (role-aware dashboard nav)", () => {
  it("always shows the ungated Dashboard item", () => {
    for (const roles of [["admin"], ["manager"], ["csa"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/");
    }
  });

  it("shows the ungated Shops item to every role (csa sees it read-only)", () => {
    for (const roles of [["admin"], ["manager"], ["csa"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/shops");
    }
  });

  it("shows the ungated Catalog item to every role (csa sees it read-only)", () => {
    for (const roles of [["admin"], ["manager"], ["csa"], []] as const) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/catalog");
    }
  });

  it("shows the Admin item only to an administrator", () => {
    expect(visibleNav(NAV, ["admin"]).map((i) => i.to)).toContain("/admin");
    expect(visibleNav(NAV, ["manager", "admin"]).map((i) => i.to)).toContain("/admin");
  });

  it("hides the Admin item from manager / csa / role-less accounts", () => {
    expect(visibleNav(NAV, ["manager"]).map((i) => i.to)).not.toContain("/admin");
    expect(visibleNav(NAV, ["csa"]).map((i) => i.to)).not.toContain("/admin");
    expect(visibleNav(NAV, []).map((i) => i.to)).not.toContain("/admin");
  });
});
