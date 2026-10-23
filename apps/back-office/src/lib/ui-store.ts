import { createUiStore, type Theme } from "@effy/web-kit";

// TanStack Store — genuine client state only (theme, sidebar collapse, command palette). Server
// data never goes here (Principle VI; constitution v1.4.0 locks Store as the web client-state lib).
// The store factory is shared; the `effy` storage prefix is this surface's namespace.
const ui = createUiStore("effy");

export type { Theme };
export const uiStore = ui.store;
export const setTheme = ui.setTheme;
export const setCommandPaletteOpen = ui.setCommandPaletteOpen;
export const setSidebarOpen = ui.setSidebarOpen;
export const toggleSidebar = ui.toggleSidebar;
export const applyTheme = ui.applyTheme;
