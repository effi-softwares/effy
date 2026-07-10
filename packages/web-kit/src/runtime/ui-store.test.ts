import { beforeEach, describe, expect, it } from "vitest";

import { createUiStore } from "./ui-store";

// The shell's collapse bit is genuine client-UI state in the one sanctioned store (TanStack Store,
// constitution v1.4.0) — not the shadcn block's cookie. Each surface gets its own namespaced store
// so two consoles open in one browser don't fight over a theme key.
describe("createUiStore", () => {
  let ui: ReturnType<typeof createUiStore>;

  beforeEach(() => {
    window.localStorage.clear();
    ui = createUiStore("effy-test");
    ui.setSidebarOpen(true);
  });

  it("toggles the sidebar between expanded and collapsed", () => {
    expect(ui.store.state.sidebarOpen).toBe(true);
    ui.toggleSidebar();
    expect(ui.store.state.sidebarOpen).toBe(false);
    ui.toggleSidebar();
    expect(ui.store.state.sidebarOpen).toBe(true);
  });

  it("persists the last sidebar value under the surface's prefix", () => {
    ui.setSidebarOpen(false);
    expect(window.localStorage.getItem("effy-test.sidebarOpen")).toBe("false");
    ui.setSidebarOpen(true);
    expect(window.localStorage.getItem("effy-test.sidebarOpen")).toBe("true");
  });

  it("toggles theme and reflects it on the document element", () => {
    ui.setTheme("dark");
    expect(ui.store.state.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    ui.toggleTheme();
    expect(ui.store.state.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("namespaces two surfaces independently", () => {
    const other = createUiStore("effy-other");
    ui.setSidebarOpen(false);
    other.setSidebarOpen(true);
    expect(window.localStorage.getItem("effy-test.sidebarOpen")).toBe("false");
    expect(window.localStorage.getItem("effy-other.sidebarOpen")).toBe("true");
  });
});
