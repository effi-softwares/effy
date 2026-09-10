import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { orderDetail, orderList } from "./fixtures"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => () => {},
}))

const getOrder = vi.hoisted(() => vi.fn())
const issueShopRefund = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  getOrder,
  issueShopRefund,
  listOrders: vi.fn(async () => orderList([])),
  getOrderActivity: vi.fn(async () => ({ entries: [] })),
  setOrderTags: vi.fn(),
  addOrderNote: vi.fn(),
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
  transitionFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}))

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }))
vi.mock("@/features/auth/queries", () => ({ sessionQuery }))

import { OrderDetailScreen } from "../OrderDetailScreen"

const DETAIL = orderDetail({
  lines: [
    { ...orderDetail().lines[0]!, orderItemId: "oi1", orderedQuantity: 2, refundedQuantity: 0 },
    {
      ...orderDetail().lines[0]!,
      orderItemId: "oi2",
      name: "Oat milk 1L",
      orderedQuantity: 3,
      refundedQuantity: 1,
      unitPrice: "3.00",
      lineTotal: "9.00",
    },
  ],
})

function wrap(roles: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(["session"], {
    status: "signed-in",
    identity: { subject: "s1", email: "maya@effy.shop", roles },
  })
  getOrder.mockResolvedValue(DETAIL)
  return render(
    <QueryClientProvider client={qc}>
      <OrderDetailScreen fulfillmentId="f1" />
    </QueryClientProvider>,
  )
}

/**
 * US5 / FR-014b (T044) — refunding is manager-only, and a non-manager is not shown a control they
 * cannot use.
 *
 * ⚠ THIS IS NOT THE SECURITY BOUNDARY AND THE TESTS SAY SO. The backend decides from the platform
 * record (role AND status AND whether the caller's shop is on THIS order), and refuses regardless of
 * what renders here. What these pin is the courtesy half — that a `shop_staff` operator, who
 * deliberately has full fulfilment access under 020's FR-019a, never meets a refusal they can do
 * nothing about.
 */
describe("shop refund control", () => {
  const paymentCard = async () =>
    (await screen.findByText(/captured at checkout/)).parentElement as HTMLElement

  it("offers refunding to a shop manager, in the Payment card", async () => {
    wrap(["shop_manager"])
    expect(within(await paymentCard()).getByRole("button", { name: "Refund" })).toBeInTheDocument()
  })

  it("withholds it from shop_staff, who still keep full fulfilment access", async () => {
    wrap(["shop_staff"])
    await paymentCard()
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument()
    expect(screen.getAllByText("Barossa Free-Range Eggs 700g").length).toBeGreaterThan(0)
  })

  it("withholds it from a role-less operator", async () => {
    wrap([])
    await paymentCard()
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument()
  })

  it("never issues a refund from merely rendering the screen", async () => {
    wrap(["shop_manager"])
    await paymentCard()
    expect(issueShopRefund).not.toHaveBeenCalled()
  })

  /** The design's line picker: a quantity per line, a "max" shortcut clamped to what is left. */
  it("offers each line up to what is still refundable", async () => {
    wrap(["shop_manager"])
    await userEvent.click(within(await paymentCard()).getByRole("button", { name: "Refund" }))
    const sheet = await screen.findByRole("dialog")
    // Oat milk: 3 ordered, 1 already on its way back → max 2 (the eggs' 2 of 2 read "max 2" too).
    expect(within(sheet).getAllByRole("button", { name: "max 2" })).toHaveLength(2)
    expect(within(sheet).getByText(/1 already refunded/)).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Issue refund" })).toBeDisabled()
  })

  it("sends lines and quantities — never an amount — and restock only when asked", async () => {
    issueShopRefund.mockResolvedValue({ refundId: "r1", status: "submitted", amount: "6.00" })
    wrap(["shop_manager"])
    await userEvent.click(within(await paymentCard()).getByRole("button", { name: "Refund" }))
    const sheet = await screen.findByRole("dialog")
    // The second line — oat milk, $3.00 each.
    await userEvent.click(within(sheet).getAllByRole("button", { name: "max 2" })[1]!)
    expect(within(sheet).getByText("$6.00", { selector: "div.text-base" })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Issue refund" }))

    await waitFor(() => expect(issueShopRefund).toHaveBeenCalled())
    const [orderId, body] = issueShopRefund.mock.calls[0]!
    expect(orderId).toBe(DETAIL.orderId)
    expect(body).toEqual({ lines: [{ orderItemId: "oi2", quantity: 2 }], reason: "item_not_supplied", restock: false })
    expect(body).not.toHaveProperty("amount")
  })

  /**
   * ⚠ 057 A3 put the order's money on this screen by operator decision. It did NOT make capture or a
   * tax line real: Effy captures at payment (055 R3) and per-item GST is unmodelled (052 R13).
   */
  it("shows the order's money, but no capture control and no tax line", async () => {
    wrap(["shop_manager"])
    await paymentCard()
    expect(screen.queryByRole("button", { name: /capture/i })).not.toBeInTheDocument()
    expect(document.body.textContent ?? "").not.toMatch(/\b(VAT|GST)\b/)
  })
})
