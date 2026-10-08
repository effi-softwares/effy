import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const apiGet = vi.hoisted(() => vi.fn())
vi.mock("@/lib/dal", () => ({ getSession: async () => ({ idToken: "t", accessToken: "a" }) }))
vi.mock("@/lib/api/edge", () => ({ edgeApi: () => ({ get: apiGet }), uncached: () => ({ cache: "no-store" }) }))
vi.mock("@/components/live/LiveRefresh", () => ({ LiveRefresh: () => null }))
vi.mock("./PointsViewed", () => ({ PointsViewed: () => null }))

const { PointsTab } = await import("./PointsTab")

const BALANCE = { points: 1250, valueAmount: "12.50", centsPerPoint: 1, nextExpiry: { points: 500, date: "2027-10-08" } }
const PAGE = {
  entries: [
    { id: "2", kind: "spent", points: -300, valueAmount: "-3.00", words: "Used on order EFY-ABC123", orderNumber: "EFY-ABC123", expiresOn: null, at: "2026-10-09T01:00:00Z" },
    { id: "1", kind: "staff_credit", points: 1550, valueAmount: "15.50", words: "Sorry your order was late", orderNumber: null, expiresOn: "2027-10-08", at: "2026-10-08T01:00:00Z" },
  ],
  nextCursor: "abc",
}

// ⚠ Braces: a beforeEach that RETURNS a function has it called as a cleanup hook — and mockReset
// returns the mock itself.
beforeEach(() => {
  apiGet.mockReset()
})

describe("Effy points tab (074 US1)", () => {
  it("shows the balance, its value, the next expiry and each line in Effy's words", async () => {
    apiGet.mockResolvedValue({ ...BALANCE, history: PAGE })
    render(await PointsTab({}))
    expect(screen.getByText("1,250 points")).toBeInTheDocument()
    expect(screen.getByText(/worth \$12\.50/)).toBeInTheDocument()
    expect(screen.getByText(/500 points can be used until 8 Oct 2027/)).toBeInTheDocument()
    expect(screen.getByText("Sorry your order was late")).toBeInTheDocument()
    expect(screen.getByText("Used on order EFY-ABC123")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute("href", "/account?tab=points&cursor=abc")
    // One read for the whole tab.
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet.mock.calls[0]![0]).toBe("/customer/v1/points")
  })

  it("says it could not load, rather than claiming a zero balance", async () => {
    apiGet.mockRejectedValue(new Error("down"))
    render(await PointsTab({}))
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t load your points/i)
    expect(screen.queryByText(/0 points/)).not.toBeInTheDocument()
  })

  it("explains points to someone who has none", async () => {
    apiGet.mockResolvedValue({ ...BALANCE, points: 0, valueAmount: "0.00", nextExpiry: null, history: { entries: [] } })
    render(await PointsTab({}))
    expect(screen.getByText(/don.t have any points yet/)).toBeInTheDocument()
  })
})
