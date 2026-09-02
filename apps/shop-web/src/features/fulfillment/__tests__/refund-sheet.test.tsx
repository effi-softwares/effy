import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { FulfillmentDetail } from "../model"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

const getFulfillment = vi.hoisted(() => vi.fn())
const issueShopRefund = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  getFulfillment,
  issueShopRefund,
  listFulfillments: vi.fn(),
  transitionFulfillment: vi.fn(),
  updateItemProgress: vi.fn(),
}))

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }))
vi.mock("@/features/auth/queries", () => ({ sessionQuery }))

import { OrderDetailScreen } from "../OrderDetailScreen"

const DETAIL: FulfillmentDetail = {
  id: "f1",
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "EFY-10023",
  placedAt: "2026-09-02T02:14:05Z",
  status: "picking",
  stateChangedAt: "2026-09-02T02:15:11Z",
  promise: { serviceLevel: "standard", readyBy: "2026-09-02T03:14:05Z" },
  delivery: {
    recipientName: "Maya Oyelaran",
    phone: null,
    line1: "12 Riverina St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postalCode: "3000",
    country: "AU",
  },
  items: [
    {
      orderItemId: "oi1",
      name: "Barossa Free-Range Eggs 700g",
      sku: "EGG-700",
      imageUrl: null,
      orderedQuantity: 2,
      gatheredQuantity: 2,
      unavailableQuantity: 0,
    },
  ],
} as FulfillmentDetail

function wrap(roles: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(["session"], {
    status: "signed-in",
    identity: { subject: "s1", email: "maya@effy.shop", roles },
  })
  getFulfillment.mockResolvedValue(DETAIL)
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
  it("offers refunding to a shop manager", async () => {
    wrap(["shop_manager"])
    expect(await screen.findByRole("button", { name: /refund items/i })).toBeInTheDocument()
  })

  it("withholds it from shop_staff, who still keep full fulfilment access", async () => {
    wrap(["shop_staff"])
    await screen.findByText("EFY-10023")

    expect(screen.queryByRole("button", { name: /refund items/i })).not.toBeInTheDocument()
    // ⚠ The rest of the screen is UNCHANGED for them — picking is their job (020 FR-019a).
    expect(screen.getByText("Barossa Free-Range Eggs 700g")).toBeInTheDocument()
  })

  it("withholds it from a role-less operator", async () => {
    wrap([])
    await screen.findByText("EFY-10023")
    expect(screen.queryByRole("button", { name: /refund items/i })).not.toBeInTheDocument()
  })

  it("never issues a refund from merely rendering the screen", async () => {
    wrap(["shop_manager"])
    await screen.findByText("EFY-10023")
    expect(issueShopRefund).not.toHaveBeenCalled()
  })

  /**
   * ⚠ 020 SC-007 restated at the refund boundary. This screen shows no order-level money, and adding
   * a refund control must not have introduced any: a shop sees ITS OWN lines, never what the whole
   * order was charged.
   */
  it("still shows no order-level total anywhere", async () => {
    wrap(["shop_manager"])
    await screen.findByText("EFY-10023")
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/order total|grand total|amount paid/i)
  })
})
