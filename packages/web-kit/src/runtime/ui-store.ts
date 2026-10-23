import { Store } from "@tanstack/react-store";

/**
 * Client state only: theme, sidebar collapse, command palette. Server data belongs in a query. Each
 * surface has its own store (prefixed by surface name). The theme is `light | dark | system`; `system`
 * follows the OS live and is the default.
 */

export type Theme = "light" | "dark" | "system";

export interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
  sidebarOpen: boolean;
}

export interface UiStore {
  store: Store<UiState>;
  setTheme(theme: Theme): void;
  setCommandPaletteOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  toggleSidebar(): void;
  applyTheme(theme: Theme): void;
}

export function createUiStore(prefix: string): UiStore {
  const themeKey = `${prefix}.theme`;
  const sidebarKey = `${prefix}.sidebarOpen`;

  function systemPrefersDark(): boolean {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }

  function initialTheme(): Theme {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(themeKey);
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    }
    return "system";
  }

  function initialSidebarOpen(): boolean {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(sidebarKey);
      if (saved === "true" || saved === "false") return saved === "true";
    }
    return true; // expanded by default
  }

  const store = new Store<UiState>({
    theme: initialTheme(),
    commandPaletteOpen: false,
    sidebarOpen: initialSidebarOpen(),
  });

  // While following the system, an OS change reflows the app; the listener detaches when the user forces a mode.
  let mql: MediaQueryList | null = null;
  let mediaListener: (() => void) | null = null;

  function detachMedia(): void {
    if (mql && mediaListener) mql.removeEventListener("change", mediaListener);
    mediaListener = null;
  }

  function resolvedDark(theme: Theme): boolean {
    return theme === "dark" || (theme === "system" && systemPrefersDark());
  }

  /**
   * Sets `data-theme` (the persisted switch, written for both appearances because each console's
   * pre-paint script reads it back) and derives the `.dark` class Tailwind keys on, together.
   */
  function applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;
    const dark = resolvedDark(theme);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");

    if (theme === "system" && typeof window !== "undefined" && window.matchMedia) {
      if (!mql) mql = window.matchMedia("(prefers-color-scheme: dark)");
      if (!mediaListener) {
        mediaListener = () => {
          if (store.state.theme === "system") {
            const nowDark = systemPrefersDark();
            document.documentElement.classList.toggle("dark", nowDark);
            document.documentElement.setAttribute("data-theme", nowDark ? "dark" : "light");
          }
        };
        mql.addEventListener("change", mediaListener);
      }
    } else {
      detachMedia();
    }
  }

  function setTheme(theme: Theme): void {
    store.setState((s) => ({ ...s, theme }));
    if (typeof window !== "undefined") window.localStorage.setItem(themeKey, theme);
    applyTheme(theme);
  }

  function setSidebarOpen(open: boolean): void {
    store.setState((s) => ({ ...s, sidebarOpen: open }));
    if (typeof window !== "undefined") window.localStorage.setItem(sidebarKey, String(open));
  }

  return {
    store,
    setTheme,
    setCommandPaletteOpen: (open) => store.setState((s) => ({ ...s, commandPaletteOpen: open })),
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(!store.state.sidebarOpen),
    applyTheme,
  };
}
