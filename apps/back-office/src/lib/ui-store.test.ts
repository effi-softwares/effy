import { describe, expect, it } from "vitest"

import { setSidebarOpen, uiStore } from "./ui-store"

describe("uiStore.sidebarOpen", () => {
  it("persists the last value under the console's key", () => {
    setSidebarOpen(false)
    expect(uiStore.state.sidebarOpen).toBe(false)
    expect(window.localStorage.getItem("effy.sidebarOpen")).toBe("false")
    setSidebarOpen(true)
    expect(window.localStorage.getItem("effy.sidebarOpen")).toBe("true")
  })
})
