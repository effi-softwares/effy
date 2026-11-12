import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const repo = vi.hoisted(() => ({ getCustomerNotificationPreferences: vi.fn() }))
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }))

const { NotificationsPanel } = await import("./NotificationsPanel")

describe("a customer's notification choices in back-office (111 US7)", () => {
  it("shows each category's choice and their latest answer to offers and news, with nothing to change", async () => {
    repo.getCustomerNotificationPreferences.mockResolvedValue({
      categories: [
        { category: "orders", required: false, marketing: false, push: false, email: true, changeable: ["push", "email"] },
        { category: "points", required: false, marketing: false, push: true, email: true, changeable: ["push", "email"] },
        { category: "offers", required: false, marketing: true, push: true, email: false, changeable: ["push"] },
        { category: "news", required: false, marketing: true, push: true, email: false, changeable: ["push"] },
        { category: "important", required: true, marketing: false, push: true, email: true, changeable: [] },
        { category: "support", required: true, marketing: false, push: true, email: true, changeable: [] },
      ],
      consent: { offers: { granted: true, answeredAt: "2026-11-10T01:00:00Z" }, news: { granted: false, answeredAt: null } },
      messageEmail: "suppressed",
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationsPanel customerId="c-1" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText("App off · Email on")).toBeTruthy()
    expect(screen.getByText(/^Said yes on .* · App on · Email off$/)).toBeTruthy()
    // 115: an address that bounces gets no message email.
    expect(screen.getByText(/the address bounces or reported spam/)).toBeTruthy()
    expect(screen.getByText("Not asked yet - off")).toBeTruthy()
    expect(screen.getAllByText("Always on")).toHaveLength(2)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
  })
})
