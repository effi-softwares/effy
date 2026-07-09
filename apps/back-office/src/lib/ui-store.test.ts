import { beforeEach, describe, expect, it } from "vitest";

import { setSidebarOpen, toggleSidebar, uiStore } from "./ui-store";

// The dashboard-shell collapse bit is genuine client-UI state in the one sanctioned store
// (Amendment D1 / research G6) — not the shadcn block's cookie.
describe("uiStore.sidebarOpen (dashboard shell collapse)", () => {
  beforeEach(() => setSidebarOpen(true));

  it("toggles between expanded and collapsed", () => {
    expect(uiStore.state.sidebarOpen).toBe(true);
    toggleSidebar();
    expect(uiStore.state.sidebarOpen).toBe(false);
    toggleSidebar();
    expect(uiStore.state.sidebarOpen).toBe(true);
  });

  it("persists the last value to localStorage", () => {
    setSidebarOpen(false);
    expect(window.localStorage.getItem("effy.sidebarOpen")).toBe("false");
    setSidebarOpen(true);
    expect(window.localStorage.getItem("effy.sidebarOpen")).toBe("true");
  });
});
