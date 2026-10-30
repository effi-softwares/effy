import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { orderList, orderRow } from "@/features/fulfillment/__tests__/fixtures"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))

const listOrders = vi.hoisted(() => vi.fn())
vi.mock("@/features/fulfillment/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listOrders,
}))

const playChime = vi.hoisted(() => vi.fn())
vi.mock("@/lib/chime", () => ({ playChime, unlockAudio: vi.fn(), unlockOnFirstGesture: () => () => { } }))

const { NewOrderAlert } = await import("../NewOrderAlert")

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe("the new-order alert", () => {
  it("names the order nobody has opened, chimes, and opens it", async () => {
    listOrders.mockResolvedValue(
      orderList([
        orderRow({ id: "seen", orderNumber: "EFY-1", status: "received" }),
        orderRow({ id: "new", orderNumber: "EFY-2", status: "pending", itemCount: 6, deliveredBy: "effy_driver" }),
      ]),
    )
    wrap(<NewOrderAlert />)
    expect(await screen.findByText("EFY-2")).toBeInTheDocument()
    expect(screen.queryByText("EFY-1")).not.toBeInTheDocument()
    expect(screen.getByText(/6 items · Effy driver/)).toBeInTheDocument()
    expect(playChime).toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /open order/i }))
    expect(navigate).toHaveBeenCalledWith({ to: "/orders/$fulfillmentId", params: { fulfillmentId: "new" } })
  })

  it("asks only for the server's own list - never on a timer of its own", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ status: "pending" })]))
    wrap(<NewOrderAlert />)
    await screen.findByRole("alert")
    expect(listOrders).toHaveBeenCalledTimes(1)
    expect(listOrders).toHaveBeenCalledWith({ tab: "new", dir: "asc" })
  })

  it("goes quiet on Later", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ status: "pending" })]))
    wrap(<NewOrderAlert />)
    await userEvent.click(await screen.findByRole("button", { name: "Later" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("shows nothing when every order has been opened", async () => {
    listOrders.mockResolvedValue(orderList([orderRow({ status: "received" })]))
    const { container } = wrap(<NewOrderAlert />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(playChime).not.toHaveBeenCalled()
  })
})
