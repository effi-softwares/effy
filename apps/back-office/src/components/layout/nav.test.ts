import { describe, expect, it } from "vitest";

import { visibleNav } from "./nav";

// Role-aware nav (Amendment D1 / FR-023 / SC-013). The Admin item must reflect the authoritative
// backend gate: visible only to an admin, hidden for manager/csa/role-less accounts.
describe("visibleNav (role-aware dashboard nav)", () => {
  it("always shows the ungated Dashboard item", () => {
    for (const roles of [["admin"], ["manager"], ["csa"], []] as const) {
      expect(visibleNav(roles).map((i) => i.to)).toContain("/");
    }
  });

  it("shows the Admin item only to an administrator", () => {
    expect(visibleNav(["admin"]).map((i) => i.to)).toContain("/admin");
    expect(visibleNav(["manager", "admin"]).map((i) => i.to)).toContain("/admin");
  });

  it("hides the Admin item from manager / csa / role-less accounts", () => {
    expect(visibleNav(["manager"]).map((i) => i.to)).not.toContain("/admin");
    expect(visibleNav(["csa"]).map((i) => i.to)).not.toContain("/admin");
    expect(visibleNav([]).map((i) => i.to)).not.toContain("/admin");
  });
});
