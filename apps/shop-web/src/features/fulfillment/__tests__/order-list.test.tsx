import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { orderList, orderRow } from "./fixtures"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="#" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => () => {},
}))

const listOrders = vi.hoisted(() => vi.fn())
const transitionFulfillment = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  listOrders,
  transitionFulfillment,
  setOrderTags: vi.fn(),
  getOrder: vi.fn(),
  getOrderActivity: vi.fn(),
  addOrderNote: vi.fn(),
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}))

import { OrderListScreen } from "../OrderListScreen"
import type { OrdersSearch } from "../orderConsole"
import { orderListQuery } from "../queries"

function wrap(search: OrdersSearch = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSearchChange = vi.fn()
  const onOpenOrder = vi.fn()
  const utils = render(
    <QueryClientProvider client={qc}>
      <OrderListScreen search={search} onSearchChange={onSearchChange} onOpenOrder={onOpenOrder} />
    </QueryClientProvider>,
  )
  return { ...utils, onSearchChange, onOpenOrder }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("the Orders list (057 A3)", () => {
  it("renders a row with order id in mono, customer, payment, status, items and total", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ payment: "partially_refunded" })]))
    wrap()

    const id = await screen.findByText("EFY-10023")
    expect(id.className).toContain("font-mono")
    expect(screen.getByText("Maya Oyelaran")).toBeInTheDocument()
    // ⚠ The longest payment label, on one line — the column is sized for it.
    const pay = screen.getByText("Partially refunded")
    expect(pay.className).toContain("whitespace-nowrap")
    expect(screen.getByText("$57.80")).toBeInTheDocument()
  })

  /** ⚠ Counts cover EVERY state, from the server — not the rows on this page. */
  it("shows the server's counts on every status tab", async () => {
    listOrders.mockResolvedValue(
      orderList([orderRow()], {
        counts: { all: 41, new: 3, picking: 5, ready_for_pickup: 2, collected: 9, delivered: 20, unfulfillable: 1, withdrawn: 1 },
      }),
    )
    wrap()
    await screen.findByText("EFY-10023")
    const tab = screen.getByRole("tab", { name: /Delivered/ })
    expect(tab).toHaveTextContent("20")
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("41")
    expect(screen.getByRole("tab", { name: /Can't supply/ })).toHaveTextContent("1")
  })

  it("marks an at-risk order and a short one in the row", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ atRisk: true, unavailableCount: 2, tags: ["fragile"] })]))
    wrap()
    const row = (await screen.findByText("EFY-10023")).closest("tr")!
    expect(within(row).getByText("At risk")).toBeInTheDocument()
    expect(within(row).getByText("2 short")).toBeInTheDocument()
    expect(within(row).getByText("fragile")).toBeInTheDocument()
  })

  it("opens the order when its row is clicked", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ id: "f9" })]))
    const { onOpenOrder } = wrap()
    await userEvent.click(await screen.findByText("Maya Oyelaran"))
    expect(onOpenOrder).toHaveBeenCalledWith("f9")
  })

  it("asks the server with the URL's filters, so search and filters compose", async () => {
    listOrders.mockResolvedValue(orderList([]))
    wrap({ q: "maya", method: "same_day", payment: "refunded", tab: "picking" })
    await screen.findByText(/No orders match/)
    expect(listOrders).toHaveBeenCalledWith({ q: "maya", method: "same_day", payment: "refunded", tab: "picking" })
  })

  it("changing a filter returns to page one", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()], { total: 60, page: 2 }))
    const { onSearchChange } = wrap({ page: 2 })
    await screen.findByText("EFY-10023")
    await userEvent.click(screen.getByRole("button", { name: "At risk" }))
    expect(onSearchChange).toHaveBeenCalledWith({ attention: "at_risk" })
  })

  it("debounces the search box into the URL", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()]))
    const { onSearchChange } = wrap()
    await screen.findByText("EFY-10023")
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.type(screen.getByLabelText("Search"), "EFY-1")
    expect(onSearchChange).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onSearchChange).toHaveBeenLastCalledWith({ q: "EFY-1" })
  })

  it("marks the saved view that matches the current filters, and only that one", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()]))
    wrap({ method: "same_day" })
    await screen.findByText("EFY-10023")
    expect(screen.getByRole("button", { name: "Same-day" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "All orders" })).toHaveAttribute("aria-pressed", "false")
  })

  it("sorts by a column header, flipping direction on the second click", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()]))
    const { onSearchChange, rerender } = wrap()
    await screen.findByText("EFY-10023")
    await userEvent.click(screen.getByRole("button", { name: /^Total/ }))
    expect(onSearchChange).toHaveBeenLastCalledWith({ sort: "total", dir: "desc" })

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <OrderListScreen search={{ sort: "total", dir: "desc" }} onSearchChange={onSearchChange} onOpenOrder={vi.fn()} />
      </QueryClientProvider>,
    )
    await userEvent.click(await screen.findByRole("button", { name: /^Total/ }))
    expect(onSearchChange).toHaveBeenLastCalledWith({ sort: "total" })
  })

  it("pages with Previous/Next and says where it is", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()], { total: 60, page: 2 }))
    const { onSearchChange } = wrap({ page: 2 })
    await screen.findByText("Page 2 of 3")
    expect(screen.getByText("Showing 26–26 of 60")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(onSearchChange).toHaveBeenLastCalledWith({ page: 3 })
  })
})

describe("empty states say which kind of empty it is", () => {
  it("no orders at all", async () => {
    listOrders.mockResolvedValue(orderList([]))
    wrap()
    expect(await screen.findByText("No orders yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
  })

  it("no orders matching the filters — with a way out", async () => {
    listOrders.mockResolvedValue(orderList([]))
    const { onSearchChange } = wrap({ q: "zzz", range: "today", sort: "total" })
    expect(await screen.findByText("No orders match these filters")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    // Filters go; the operator's chosen sort stays.
    expect(onSearchChange).toHaveBeenCalledWith({ sort: "total" })
  })
})

describe("selection and the bulk bar", () => {
  it("appears with the selection count and clears on demand", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ id: "a", orderNumber: "EFY-A" }), orderRow({ id: "b", orderNumber: "EFY-B" })]))
    wrap()
    await screen.findByText("EFY-A")
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText("Select EFY-A"))
    await userEvent.click(screen.getByLabelText("Select EFY-B"))
    expect(screen.getByText("2 selected")).toBeInTheDocument()
    for (const name of [/Fulfil/, /Add tag/, /Can't supply/, /Clear selection/]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole("button", { name: /Clear selection/ }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("ticking a row does not open it", async () => {
    listOrders.mockResolvedValue(orderList([orderRow()]))
    const { onOpenOrder } = wrap()
    await userEvent.click(await screen.findByLabelText("Select EFY-10023"))
    expect(onOpenOrder).not.toHaveBeenCalled()
  })

  it("bulk fulfil advances each order to ITS OWN next state", async () => {
    listOrders.mockResolvedValue(
      orderList([
        orderRow({ id: "a", orderNumber: "EFY-A", status: "received" }),
        orderRow({ id: "b", orderNumber: "EFY-B", status: "picking" }),
      ]),
    )
    transitionFulfillment.mockResolvedValue({})
    wrap()
    await userEvent.click(await screen.findByLabelText("Select all orders on this page"))
    await userEvent.click(screen.getByRole("button", { name: /Fulfil 2/ }))
    expect(transitionFulfillment).toHaveBeenCalledWith("a", { to: "picking" })
    expect(transitionFulfillment).toHaveBeenCalledWith("b", { to: "ready_for_pickup" })
  })
})

describe("orderListQuery", () => {
  it("polls every 15s and never in a hidden tab (SC-001, carried from the queue)", () => {
    const q = orderListQuery({})
    expect(q.refetchInterval).toBe(15_000)
    expect(q.refetchIntervalInBackground).toBe(false)
  })

  it("keys equal lists identically, however the URL spelled them", () => {
    expect(orderListQuery({}).queryKey).toEqual(orderListQuery({ tab: "all" as never, page: 1 }).queryKey)
  })
})
