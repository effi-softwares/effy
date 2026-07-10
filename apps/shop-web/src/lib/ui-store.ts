import { createUiStore, type Theme } from "@effy/web-kit";

// TanStack Store — GENUINE CLIENT STATE ONLY (theme, sidebar collapse, command palette). Server
// data NEVER goes here; the server-state cache owns it (Principle VI).
//
// The `effy-shop` prefix namespaces this surface's localStorage keys, so a developer running
// back-office and shop-web side by side doesn't have one console's theme flip the other's.
const ui = createUiStore("effy-shop");

export type { Theme };
export const uiStore = ui.store;
export const setTheme = ui.setTheme;
export const toggleTheme = ui.toggleTheme;
export const setCommandPaletteOpen = ui.setCommandPaletteOpen;
export const setSidebarOpen = ui.setSidebarOpen;
export const toggleSidebar = ui.toggleSidebar;
export const applyTheme = ui.applyTheme;
