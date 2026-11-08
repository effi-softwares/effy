import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@effy/web-kit/live", () => ({
  createCoalescer: (run: () => void) => ({ trigger: run, cancel: () => undefined }),
  createLiveClient: () => ({ start: () => undefined, stop: () => undefined, state: () => "off", retryNow: () => undefined }),
}))

const { NotificationBell } = await import("./NotificationBell")

describe("the header bell (110 US6)", () => {
  it("says how many are new, to a screen reader too, and links to the notifications page", () => {
    render(<NotificationBell initialCount={3} />)
    const link = screen.getByRole("link", { name: "Notifications, 3 new" })
    expect(link.getAttribute("href")).toBe("/account/notifications")
    expect(link.textContent).toContain("3")
  })

  it("shows no number at zero", () => {
    render(<NotificationBell initialCount={0} />)
    expect(screen.getByRole("link", { name: "Notifications" }).textContent).toBe("")
  })
})
