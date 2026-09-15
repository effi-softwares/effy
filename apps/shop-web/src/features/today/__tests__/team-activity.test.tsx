import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
  useNavigate: () => () => {},
}))

const getTeamActivity = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ getTeamActivity, getToday: vi.fn() }))

import type { ShopTeamActivityDTO } from "@effy/shared-types"

import { TeamActivitySheet } from "../TeamActivitySheet"

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

const NOW = Date.now()

function activity(over: Partial<ShopTeamActivityDTO> = {}): ShopTeamActivityDTO {
  return {
    entries: [
      {
        id: "fe-1",
        at: new Date(NOW - 6 * 60_000).toISOString(),
        actor: { kind: "staff", name: "Tobias Aldén" },
        action: { kind: "state_changed", orderNumber: "EFY-4415", to: "ready_for_pickup" },
        tone: "done",
      },
      {
        id: "sm-1",
        at: new Date(NOW - 24 * 60_000).toISOString(),
        actor: { kind: "staff", name: "Rana Saleh" },
        action: { kind: "stock_changed", productName: "Stoneware mug", reason: "received", delta: 12 },
        tone: "neutral",
      },
      {
        id: "rf-1",
        at: new Date(NOW - 70 * 60_000).toISOString(),
        actor: { kind: "former_staff" },
        action: { kind: "refund_issued", orderNumber: "EFY-4413", amount: "5.40" },
        tone: "problem",
      },
      {
        id: "sm-2",
        at: new Date(NOW - 120 * 60_000).toISOString(),
        actor: { kind: "effy" },
        action: { kind: "stock_changed", productName: "Oat milk", reason: "order_paid", delta: -3 },
        tone: "neutral",
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  // Cleared first: these counts are per-test, and Testing Library unmounts the previous test's tree
  // around this one.
  vi.clearAllMocks()
  getTeamActivity.mockResolvedValue(activity())
})

describe("Team activity (US5)", () => {
  it("lists what happened, newest first, in the operator's words", async () => {
    wrap(<TeamActivitySheet open onOpenChange={() => {}} />)

    expect(await screen.findByText("Team activity")).toBeInTheDocument()
    expect(screen.getByText("Everything the team has done, newest first.")).toBeInTheDocument()
    // Awaited: the sheet's chrome renders immediately, its entries after the read resolves.
    expect(await screen.findByText("finished picking EFY-4415")).toBeInTheDocument()
    expect(screen.getByText("added 12 × Stoneware mug (received)")).toBeInTheDocument()
    expect(screen.getByText("issued a refund of 5.40 on EFY-4413")).toBeInTheDocument()
  })

  it("names the person, ages the timestamp, and never leaves an actor blank", async () => {
    wrap(<TeamActivitySheet open onOpenChange={() => {}} />)

    expect(await screen.findByText(/6 min ago · Tobias Aldén/)).toBeInTheDocument()
    // 020: a missing operator record means "the person is gone", never "nobody did it".
    expect(screen.getByText(/1 h ago · A former team member/)).toBeInTheDocument()
  })

  it("⚠ attributes platform actions to Effy, not to an Effy employee", async () => {
    wrap(<TeamActivitySheet open onOpenChange={() => {}} />)
    expect(await screen.findByText(/2 h ago · Effy/)).toBeInTheDocument()
  })

  it("says so plainly when there is nothing to show", async () => {
    getTeamActivity.mockResolvedValue({ entries: [] })
    wrap(<TeamActivitySheet open onOpenChange={() => {}} />)
    expect(
      await screen.findByText("Nothing has been recorded in the last two weeks."),
    ).toBeInTheDocument()
  })

  it("⚠ fetches nothing until the sheet is opened", () => {
    wrap(<TeamActivitySheet open={false} onOpenChange={() => {}} />)
    // Two weeks of audit rows is not a page-load cost for a sheet most operators never open.
    expect(getTeamActivity).not.toHaveBeenCalled()
  })
})
