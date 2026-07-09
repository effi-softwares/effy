import { Store } from "@tanstack/react-store";

// TanStack Store — GENUINE CLIENT STATE ONLY (theme, command-palette, hotkey scope). Server data
// NEVER goes here (Principle VI; constitution v1.4.0 locks Store as the web client-state lib).

export type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
  // Dashboard shell collapse bit (FR-023 / Amendment D1). Genuine client-UI state — the
  // SidebarProvider is driven controlled from this, not the shadcn block's default cookie.
  sidebarOpen: boolean;
}

function initialTheme(): Theme {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("effy.theme");
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  }
  return "light";
}

function initialSidebarOpen(): boolean {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("effy.sidebarOpen");
    if (saved === "true" || saved === "false") return saved === "true";
  }
  return true; // expanded by default
}

export const uiStore = new Store<UiState>({
  theme: initialTheme(),
  commandPaletteOpen: false,
  sidebarOpen: initialSidebarOpen(),
});

export function setTheme(theme: Theme): void {
  uiStore.setState((s) => ({ ...s, theme }));
  if (typeof window !== "undefined") window.localStorage.setItem("effy.theme", theme);
  applyTheme(theme);
}

export function toggleTheme(): void {
  setTheme(uiStore.state.theme === "dark" ? "light" : "dark");
}

export function setCommandPaletteOpen(open: boolean): void {
  uiStore.setState((s) => ({ ...s, commandPaletteOpen: open }));
}

export function setSidebarOpen(open: boolean): void {
  uiStore.setState((s) => ({ ...s, sidebarOpen: open }));
  if (typeof window !== "undefined")
    window.localStorage.setItem("effy.sidebarOpen", String(open));
}

export function toggleSidebar(): void {
  setSidebarOpen(!uiStore.state.sidebarOpen);
}

// Reflect the theme onto <html class="dark"> so the design-system dark tokens apply.
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
