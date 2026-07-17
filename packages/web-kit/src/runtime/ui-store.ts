import { Store } from "@tanstack/react-store";

/**
 * Genuine CLIENT state only — theme, sidebar collapse, command palette.
 *
 * Server data never lands here; the server-state cache owns it (constitution Principle VI). If you
 * are tempted to put a fetched record in this store, you want a query instead.
 *
 * Each surface creates its own store so two consoles open in one browser do not share a theme
 * key. The storage prefix is the surface name.
 *
 * Appearance (017): a tri-state MODE — `light | dark | system` (was binary light/dark). `system`
 * follows the OS and updates live; the default for a first-time user is `system` (FR-013). A stored
 * legacy `light`/`dark` still loads unchanged.
 */

export type Theme = "light" | "dark" | "system";

const THEMES: readonly Theme[] = ["light", "dark", "system"];

export interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
  sidebarOpen: boolean;
}

export interface UiStore {
  store: Store<UiState>;
  setTheme(theme: Theme): void;
  /** Cycles light → dark → system (kept for back-compat; the UI uses setTheme directly). */
  toggleTheme(): void;
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
    return "system"; // FR-013 — default for a user who has never chosen
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

  // Live OS tracking: while the mode is `system`, an OS light↔dark change must reflow the app.
  // The listener is attached ONLY while following the system, and detached the moment the user
  // forces light/dark — so a forced mode never gets silently overridden.
  let mql: MediaQueryList | null = null;
  let mediaListener: (() => void) | null = null;

  function detachMedia(): void {
    if (mql && mediaListener) mql.removeEventListener("change", mediaListener);
    mediaListener = null;
  }

  function resolvedDark(theme: Theme): boolean {
    return theme === "dark" || (theme === "system" && systemPrefersDark());
  }

  function applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolvedDark(theme));

    if (theme === "system" && typeof window !== "undefined" && window.matchMedia) {
      if (!mql) mql = window.matchMedia("(prefers-color-scheme: dark)");
      if (!mediaListener) {
        mediaListener = () => {
          if (store.state.theme === "system") {
            document.documentElement.classList.toggle("dark", systemPrefersDark());
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

  function nextTheme(current: Theme): Theme {
    const i = THEMES.indexOf(current);
    return THEMES[(i + 1) % THEMES.length] as Theme;
  }

  function setSidebarOpen(open: boolean): void {
    store.setState((s) => ({ ...s, sidebarOpen: open }));
    if (typeof window !== "undefined") window.localStorage.setItem(sidebarKey, String(open));
  }

  return {
    store,
    setTheme,
    toggleTheme: () => setTheme(nextTheme(store.state.theme)),
    setCommandPaletteOpen: (open) => store.setState((s) => ({ ...s, commandPaletteOpen: open })),
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(!store.state.sidebarOpen),
    applyTheme,
  };
}
