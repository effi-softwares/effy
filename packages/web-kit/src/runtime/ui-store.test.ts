import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUiStore } from "./ui-store";

// The shell's collapse bit + the appearance mode are genuine client-UI state in the one sanctioned
// store (TanStack Store, constitution v1.4.0) — not the shadcn block's cookie. Each surface gets its
// own namespaced store so two consoles open in one browser don't fight over a theme key.

/** A controllable `matchMedia` so we can simulate an OS light↔dark switch. */
function mockMatchMedia(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    /** test helper — flip the OS preference and notify listeners */
    setOsDark(v: boolean) {
      matches = v;
      listeners.forEach((cb) => cb());
    },
    get listenerCount() {
      return listeners.size;
    },
  };
  // Return the one live object every call so tests can drive it.
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return mql;
}

describe("createUiStore", () => {
  let ui: ReturnType<typeof createUiStore>;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    mockMatchMedia(false); // OS = light by default
    ui = createUiStore("effy-test");
    ui.setSidebarOpen(true);
  });

  afterEach(() => {
    mockMatchMedia(false);
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

  it("defaults a first-time user to system (FR-013)", () => {
    expect(ui.store.state.theme).toBe("system");
  });

  it("loads a persisted mode (incl. legacy light/dark) on re-init", () => {
    ui.setTheme("dark");
    expect(window.localStorage.getItem("effy-test.theme")).toBe("dark");
    const reloaded = createUiStore("effy-test");
    expect(reloaded.store.state.theme).toBe("dark");
  });

  it("applies light and dark directly to the document element", () => {
    ui.setTheme("dark");
    expect(ui.store.state.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    ui.setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves system from the OS and tracks a live OS change", () => {
    const mql = mockMatchMedia(false);
    const store = createUiStore("effy-sys");
    store.setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    mql.setOsDark(true); // OS flips to dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    mql.setOsDark(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores OS changes once the user forces a mode", () => {
    const mql = mockMatchMedia(false);
    const store = createUiStore("effy-force");
    store.setTheme("system");
    expect(mql.listenerCount).toBe(1);
    store.setTheme("light"); // force light → detach the OS listener
    expect(mql.listenerCount).toBe(0);
    mql.setOsDark(true); // OS goes dark, but we forced light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("cycles light → dark → system via toggleTheme (back-compat)", () => {
    ui.setTheme("light");
    ui.toggleTheme();
    expect(ui.store.state.theme).toBe("dark");
    ui.toggleTheme();
    expect(ui.store.state.theme).toBe("system");
    ui.toggleTheme();
    expect(ui.store.state.theme).toBe("light");
  });

  it("namespaces two surfaces independently", () => {
    const other = createUiStore("effy-other");
    ui.setSidebarOpen(false);
    other.setSidebarOpen(true);
    expect(window.localStorage.getItem("effy-test.sidebarOpen")).toBe("false");
    expect(window.localStorage.getItem("effy-other.sidebarOpen")).toBe("true");
  });
});
