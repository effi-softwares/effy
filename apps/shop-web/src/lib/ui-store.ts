import { createUiStore } from "@effy/web-kit"

const ui = createUiStore("effy-shop")

export const uiStore = ui.store
export const setTheme = ui.setTheme
export const setCommandPaletteOpen = ui.setCommandPaletteOpen
export const setSidebarOpen = ui.setSidebarOpen
export const applyTheme = ui.applyTheme
