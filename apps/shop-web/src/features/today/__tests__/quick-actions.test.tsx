import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
  useNavigate: () => navigate,
}))

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock("@effy/design-system/ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast,
}))

const printAwaitingPickLists = vi.hoisted(() => vi.fn())
vi.mock("../printPickLists", () => ({ printAwaitingPickLists }))

const exportOrdersCsv = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/exportOrders", () => ({ exportOrdersCsv }))

import { printLists, QuickActionsSheet } from "../QuickActionsSheet"

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeEach(() => {
  printAwaitingPickLists.mockResolvedValue({ printed: 4, more: 0 })
  exportOrdersCsv.mockResolvedValue(12)
})
afterEach(() => vi.clearAllMocks())

describe("Quick actions (US4)", () => {
  it("offers exactly the six rows the platform can honour, in their groups", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={4} />)

    expect(await screen.findByText("Quick actions")).toBeInTheDocument()
    expect(screen.getByText("Everything you start from here.")).toBeInTheDocument()
    for (const group of ["Create", "Fulfilment", "Customers and reporting"]) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
    for (const row of [
      "New product",
      "Print pick lists",
      "Receive stock",
      "Open the attention queue",
      "Export orders",
      "Open insights",
    ]) {
      expect(screen.getByText(row)).toBeInTheDocument()
    }
    // ⚠ And none of the three the platform cannot do (FR-011).
    expect(screen.queryByText("New order")).not.toBeInTheDocument()
    expect(screen.queryByText("Discount code")).not.toBeInTheDocument()
    expect(screen.queryByText("Message a customer")).not.toBeInTheDocument()
  })

  it("counts the waiting orders in the print row's description", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={4} />)
    expect(await screen.findByText("4 orders are waiting to be picked.")).toBeInTheDocument()
  })

  it("says 'order is' for one — the count and the grammar come from the same place", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={1} />)
    expect(await screen.findByText("1 order is waiting to be picked.")).toBeInTheDocument()
  })

  it("sends each row where FR-010 says, closing the sheet first", async () => {
    const onOpenChange = vi.fn()
    wrap(<QuickActionsSheet open onOpenChange={onOpenChange} awaitingPick={2} />)

    await userEvent.click(await screen.findByText("New product"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(navigate).toHaveBeenCalledWith({ to: "/catalog/new" })

    await userEvent.click(screen.getByText("Open insights"))
    expect(navigate).toHaveBeenCalledWith({ to: "/insights" })
  })

  it("opens the attention queue by URL state, not by a saved view (057 FR-026)", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={2} />)
    await userEvent.click(await screen.findByText("Open the attention queue"))

    expect(navigate).toHaveBeenCalledWith({
      to: "/orders",
      search: { attention: "at_risk", sort: "placed", dir: "asc" },
    })
  })

  it("tells the operator what to do next when receiving stock", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={2} />)
    await userEvent.click(await screen.findByText("Receive stock"))

    expect(toast).toHaveBeenCalledWith("Pick a product to receive stock into")
    expect(navigate).toHaveBeenCalledWith({ to: "/catalog" })
  })

  it("exports through the Orders list's own function, so both CSVs are identical", async () => {
    wrap(<QuickActionsSheet open onOpenChange={() => {}} awaitingPick={2} />)
    await userEvent.click(await screen.findByText("Export orders"))

    await vi.waitFor(() => expect(exportOrdersCsv).toHaveBeenCalled())
    // ⚠ It exports here rather than navigating with a flag: a URL that performs an action on arrival
    // fires again on refresh and on a shared link.
    expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ search: { export: "1" } }))
  })
})

describe("printing says what actually happened", () => {
  it("reports the number sent", async () => {
    await printLists()
    expect(toast).toHaveBeenCalledWith("4 pick lists sent to printer")
  })

  it("uses the singular for one", async () => {
    printAwaitingPickLists.mockResolvedValue({ printed: 1, more: 0 })
    await printLists()
    expect(toast).toHaveBeenCalledWith("1 pick list sent to printer")
  })

  it("⚠ never claims a print when the browser blocked the window", async () => {
    // `printed: 0` is what a blocked popup looks like from here. "0 pick lists sent to printer" over
    // a window that never opened would leave an operator standing at the printer.
    printAwaitingPickLists.mockResolvedValue({ printed: 0, more: 0 })
    await printLists()
    expect(toast).toHaveBeenCalledWith("Nothing is waiting to be picked")
  })

  it("⚠ says what it could NOT include when the batch is capped", async () => {
    printAwaitingPickLists.mockResolvedValue({ printed: 100, more: 37 })
    await printLists()
    // A print that quietly covers the first hundred of a hundred and thirty-seven is how half a
    // shop's work goes unpicked with nobody aware.
    expect(toast).toHaveBeenCalledWith("100 pick lists sent to printer · 37 more not included")
  })

  it("says so when the print could not be built at all", async () => {
    printAwaitingPickLists.mockRejectedValue(new Error("network"))
    await printLists()
    expect(toast).toHaveBeenCalledWith("Pick lists couldn't be printed. Try again in a moment.")
  })
})
