import { render, screen } from "@testing-library/react";
import { ClipboardList, LayoutDashboard, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@effy/design-system/ui";

import { NavList } from "./NavList";
import { groupNav, type NavItem } from "./nav";

const location = vi.hoisted(() => ({ pathname: "/orders/abc" }));

vi.mock("@tanstack/react-router", () => ({
  // Spreads the rest so the Slot-merged `data-active` from SidebarMenuButton reaches the anchor.
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => location,
}));

type Role = "shop_manager";

const NAV: NavItem<Role>[] = [
  { label: "Today", to: "/", icon: LayoutDashboard, group: "Platform" },
  { label: "Orders", to: "/orders", icon: ClipboardList, group: "Platform" },
  { label: "Management", to: "/manager", icon: Shield, group: "Workspace" },
];

function wrap(badges?: Record<string, number | undefined>) {
  return render(
    <SidebarProvider>
      <NavList nav={NAV} roles={["shop_manager"]} badges={badges} />
    </SidebarProvider>,
  );
}

describe("groupNav", () => {
  it("splits by group in first-appearance order, keeping item order", () => {
    expect(groupNav(NAV, "Platform").map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ["Platform", ["Today", "Orders"]],
      ["Workspace", ["Management"]],
    ]);
  });

  it("puts items that name no group under the default label (one group, as before)", () => {
    const flat = NAV.map(({ group: _group, ...rest }) => rest);
    expect(groupNav(flat, "Shop").map((g) => g.label)).toEqual(["Shop"]);
  });
});

describe("NavList", () => {
  it("renders a label per group and a collapsed-mode rule only BETWEEN groups", () => {
    const { container } = wrap();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    // One rule for two groups — never above the first.
    expect(container.querySelectorAll('[aria-hidden="true"].h-px')).toHaveLength(1);
  });

  it("keeps a nested route's parent active (an order detail keeps Orders active)", () => {
    wrap();
    const orders = screen.getByText("Orders").closest("a")!;
    expect(orders).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Today").closest("a")).toHaveAttribute("data-active", "false");
  });

  // ⚠ SidebarMenuBadge is display:none in icon mode, so the count needs a second carrier there.
  it("carries a count as both the badge and the collapsed-mode dot — brand when active", () => {
    const { container } = wrap({ "/orders": 4 });
    expect(screen.getByText("4")).toBeInTheDocument();
    const dot = container.querySelector('[data-slot="nav-dot"]')!;
    expect(dot).toHaveClass("bg-brand");
    expect(dot).toHaveClass("group-data-[collapsible=icon]:block");
  });

  it("uses the attention hue for an inactive item's dot", () => {
    location.pathname = "/";
    const { container } = wrap({ "/orders": 4 });
    expect(container.querySelector('[data-slot="nav-dot"]')).toHaveClass("bg-accent2");
    location.pathname = "/orders/abc";
  });

  it("renders neither badge nor dot for a zero", () => {
    const { container } = wrap({ "/orders": 0 });
    expect(container.querySelector('[data-slot="nav-dot"]')).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });
});
