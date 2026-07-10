import { Shield, type LucideIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { currentSection, visibleNav, type NavItem } from "./nav";

type Role = "store_manager" | "store_staff";

const icon = Shield as LucideIcon;
const NAV: NavItem<Role>[] = [
  { label: "Dashboard", to: "/", icon },
  { label: "Management", to: "/manager", icon, requiredRole: "store_manager" },
];

// Role-aware nav reflects the authoritative backend gate. Hiding a link is a courtesy, not a
// guard — the backend refuses the same request regardless (FR-007).
describe("visibleNav", () => {
  it("always shows the ungated item", () => {
    for (const roles of [["store_manager"], ["store_staff"], []] as Role[][]) {
      expect(visibleNav(NAV, roles).map((i) => i.to)).toContain("/");
    }
  });

  it("shows the gated item only to the role that requires it", () => {
    expect(visibleNav(NAV, ["store_manager"]).map((i) => i.to)).toContain("/manager");
    expect(visibleNav(NAV, ["store_staff", "store_manager"]).map((i) => i.to)).toContain("/manager");
  });

  it("hides the gated item from a lower-privilege or role-less operator", () => {
    expect(visibleNav(NAV, ["store_staff"]).map((i) => i.to)).not.toContain("/manager");
    expect(visibleNav(NAV, []).map((i) => i.to)).not.toContain("/manager");
  });
});

describe("currentSection", () => {
  it("resolves the root path to the root item's label", () => {
    expect(currentSection(NAV, "/")).toBe("Dashboard");
  });

  it("matches a nested path by prefix", () => {
    expect(currentSection(NAV, "/manager/detail")).toBe("Management");
  });

  it("falls back rather than throwing on an unknown path", () => {
    expect(currentSection(NAV, "/nowhere")).toBe("Dashboard");
  });
});
