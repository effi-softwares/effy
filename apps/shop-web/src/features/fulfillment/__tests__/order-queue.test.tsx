import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { FulfillmentSummary } from "../model"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  // 057: the rebuilt screens navigate from the breadcrumb, so the mock must supply this too.
  useNavigate: () => () => {},
}))

const listFulfillments = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  listFulfillments,
  getFulfillment: vi.fn(),
  transitionFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}))

import { OrderQueueScreen } from "../OrderQueueScreen"

function row(over: Partial<FulfillmentSummary> = {}): FulfillmentSummary {
  return {
    id: "f1",
    orderNumber: "EFY-10023",
    placedAt: "2026-07-20T02:14:05Z",
    status: "received",
    stateChangedAt: "2026-07-20T02:15:11Z",
    itemCount: 4,
    gatheredCount: 2,
    unavailableCount: 0,
    promise: { serviceLevel: "standard", readyBy: "2026-07-20T03:14:05Z" },
    atRisk: false,
    ...over,
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

/** US2 (T022) — search, filter and selection over the queue the server already ordered. */
describe("order queue filtering and selection", () => {
  it("narrows by order number without disturbing the server's row order", async () => {
    listFulfillments.mockResolvedValue({
      items: [
        row({ id: "a", orderNumber: "EFY-AAA" }),
        row({ id: "b", orderNumber: "EFY-BBB" }),
        row({ id: "c", orderNumber: "EFY-BCC" }),
      ],
    })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-AAA")

    await userEvent.type(screen.getByLabelText(/search by order number/i), "bb")

    expect(screen.queryByText("EFY-AAA")).not.toBeInTheDocument()
    expect(screen.getByText("EFY-BBB")).toBeInTheDocument()
  })

  /**
   * ⚠ SC-018 restated for the filtered view. The queue's order is the server's — promise, then
   * arrival — and filtering may only REMOVE rows. If a filter ever re-sorted, an at-risk row could
   * move under a hand already reaching for it, which is how the wrong order gets picked.
   */
  it("preserves the server's sequence among the rows that survive a filter", async () => {
    listFulfillments.mockResolvedValue({
      items: [
        row({ id: "a", orderNumber: "EFY-1", atRisk: false }),
        row({ id: "b", orderNumber: "EFY-2", atRisk: true }),
        row({ id: "c", orderNumber: "EFY-3", atRisk: true }),
      ],
    })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-1")

    await userEvent.click(screen.getByLabelText(/filter by risk/i))
    await userEvent.click(await screen.findByRole("option", { name: /at risk only/i }))

    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["EFY-2", "EFY-3"])
  })

  it("reports the filtered count against the total rather than silently shrinking", async () => {
    listFulfillments.mockResolvedValue({
      items: [row({ id: "a", orderNumber: "EFY-AAA" }), row({ id: "b", orderNumber: "EFY-BBB" })],
    })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-AAA")

    await userEvent.type(screen.getByLabelText(/search by order number/i), "aaa")

    expect(
      screen.getByText((_, el) => el?.textContent?.trim() === "Showing 1 of 2 active orders"),
    ).toBeInTheDocument()
  })

  it("says a filter emptied the table, distinctly from a genuinely empty queue", async () => {
    listFulfillments.mockResolvedValue({ items: [row()] })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-10023")

    await userEvent.type(screen.getByLabelText(/search by order number/i), "zzzz")

    expect(screen.getByText(/no orders match this filter/i)).toBeInTheDocument()
    expect(screen.queryByText(/no orders waiting/i)).not.toBeInTheDocument()
  })

  it("offers only states actually present, so no filter can empty the table by itself", async () => {
    listFulfillments.mockResolvedValue({ items: [row({ status: "picking" })] })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-10023")

    await userEvent.click(screen.getByLabelText(/filter by state/i))

    expect(await screen.findByRole("option", { name: "Picking" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Collected" })).not.toBeInTheDocument()
  })

  it("reveals the bulk bar once a row is selected, and clears on demand", async () => {
    listFulfillments.mockResolvedValue({ items: [row()] })
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-10023")

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText("Select EFY-10023"))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /clear/i }))
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
  })

  /**
   * ⚠ Selection must not survive a tab change. Carrying it would let an operator advance rows they
   * can no longer see — an unreviewed bulk action by definition.
   */
  it("drops the selection when the slice changes", async () => {
    listFulfillments.mockImplementation(async (state: string) =>
      state === "completed" ? { items: [] } : { items: [row()] },
    )
    wrap(<OrderQueueScreen />)
    await screen.findByText("EFY-10023")

    await userEvent.click(screen.getByLabelText("Select EFY-10023"))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("tab", { name: /completed/i }))

    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
  })
})
