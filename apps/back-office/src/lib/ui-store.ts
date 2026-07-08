import { Store } from "@tanstack/react-store";

// TanStack Store — GENUINE CLIENT STATE ONLY (theme, command-palette, hotkey scope). Server data
// NEVER goes here (Principle VI; constitution v1.4.0 locks Store as the web client-state lib).

export type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  commandPaletteOpen: boolean;
}

function initialTheme(): Theme {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("effy.theme");
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  }
  return "light";
}

export const uiStore = new Store<UiState>({
  theme: initialTheme(),
  commandPaletteOpen: false,
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

// Reflect the theme onto <html class="dark"> so the design-system dark tokens apply.
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
