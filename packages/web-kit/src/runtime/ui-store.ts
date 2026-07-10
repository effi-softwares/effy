import { Store } from "@tanstack/react-store";

/**
 * Genuine CLIENT state only — theme, sidebar collapse, command palette.
 *
 * Server data never lands here; the server-state cache owns it (constitution Principle VI). If you
 * are tempted to put a fetched record in this store, you want a query instead.
 *
 * Each surface creates its own store so two consoles open in one browser do not share a theme
 * key. The storage prefix is the surface name.
 */

export type Theme = "light" | "dark";

export interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
  sidebarOpen: boolean;
}

export interface UiStore {
  store: Store<UiState>;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setCommandPaletteOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  toggleSidebar(): void;
  applyTheme(theme: Theme): void;
}

export function createUiStore(prefix: string): UiStore {
  const themeKey = `${prefix}.theme`;
  const sidebarKey = `${prefix}.sidebarOpen`;

  function initialTheme(): Theme {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(themeKey);
      if (saved === "light" || saved === "dark") return saved;
      if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
    }
    return "light";
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

  function applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
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
    toggleTheme: () => setTheme(store.state.theme === "dark" ? "light" : "dark"),
    setCommandPaletteOpen: (open) => store.setState((s) => ({ ...s, commandPaletteOpen: open })),
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(!store.state.sidebarOpen),
    applyTheme,
  };
}
