import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ActionBarProvider } from "@effy/web-kit/action-bar"

/* An order with two shops' packages, one still being packed (the fixtures the preview drew). */
const st: string = "packing"
const svg = (c: string) => `data:image/svg+xml,${c}`
const now = Date.now(), at = (min: number) => new Date(now - min * 60000).toISOString()
const view = (status: string, detail: string | null = null) => ({ status, word: status, detail, driverName: null })
const assign = (name: string | null, movable = true) => ({ assignmentId: name ? "a1" : null, driver: name ? { id: "d1", name } : null, opensAt: null, dueAt: at(-60), roundId: "r1", how: "Auto-assigned: fewest packages today (2)", unassignedReason: name ? null : "No driver is on duty", movable })
const bags = (code: string, zones: string[], custody: string) => zones.map((z, i) => ({ parcelId: code + i, code: i ? "4PXN2R" : code, seq: i + 1, of: zones.length, zone: z, voided: false, printedCount: 1, custody }))
const pkgBase = { consignment: null, dueOut: null, late: false, deliveryMethod: "same_day", handoff: null, arrival: null, promisedDate: new Date().toISOString().slice(0, 10), window: { startAt: new Date(now + 2 * 3600e3).toISOString(), endAt: new Date(now + 4 * 3600e3).toISOString() }, overCapacity: false, handoverDueOn: null, atRisk: false, onTime: st === "delivered" ? true : null, deliveredBy: "effy", status: "picking" }
const p1 = { ...pkgBase, fulfillmentId: "f1", packageCode: "7K3Q9M", shopId: "s1", shopName: "Carlton Fresh Market", itemCount: 5, subtotalAmount: "49.15",
  statusView: st === "problem" ? view("problem", "Bag 2 not checked in at the hub") : st === "delivered" ? view("delivered") : view("preparing"),
  milestones: st === "packing" ? [{ status: "preparing", at: at(120) }] : [{ status: "preparing", at: at(300) }, { status: "ready", at: at(200) }, { status: "with_driver", at: at(150) }, ...(st === "delivered" ? [{ status: "at_hub", at: at(140) }, { status: "out_for_delivery", at: at(80) }, { status: "delivered", at: at(10) }] : [])],
  collect: assign(st === "packing" ? "Sam Rivera" : "Sam Rivera", st === "packing"), deliver: assign(st === "packing" ? null : "Priya Nair", st !== "delivered"), parcels: bags("7K3Q9M", ["ambient", "chilled"], st === "packing" ? "at_shop" : "beyond") }
const p2 = { ...pkgBase, fulfillmentId: "f2", packageCode: "WTMZHX", shopId: "s2", shopName: "Lygon Street Grocer", itemCount: 2, subtotalAmount: "18.85",
  statusView: st === "delivered" ? view("delivered") : st === "problem" ? view("at_hub") : view("ready"),
  milestones: [{ status: "preparing", at: at(300) }, { status: "ready", at: at(250) }, ...(st !== "packing" ? [{ status: "with_driver", at: at(150) }, { status: "at_hub", at: at(140) }] : []), ...(st === "delivered" ? [{ status: "out_for_delivery", at: at(80) }, { status: "delivered", at: at(10) }] : [])],
  collect: assign("Sam Rivera", st === "packing"), deliver: assign(st === "packing" ? null : "Priya Nair"), parcels: bags("WTMZHX", ["frozen"], st === "packing" ? "packed" : "beyond") }
const item = (id: string, shopId: string, name: string, label: string, qty: number, price: string, c: string) => ({ orderItemId: id, productId: "p" + id, variantId: "v" + id, productName: name, variantLabel: label, variantCode: "V" + id.toUpperCase() + "K9Q", sku: "SK-" + id, unitPriceAmount: price, quantity: qty, lineSubtotalAmount: (Number(price) * qty).toFixed(2), shopId, imageUrl: svg(c) })
const items = [item("i1", "s1", "Hillgrove Extra Virgin Olive Oil", "750 mL", 1, "19.80", "#3d4f22"), item("i2", "s1", "Sourdough Loaf", "800 g", 1, "8.25", "#b7793f"), item("i3", "s1", "Pink Lady Apples", "1 kg", 2, "5.40", "#e0475a"), item("i4", "s1", "Jalna Greek Yoghurt Natural", "1 kg", 1, "6.85", "#2563eb"), item("i5", "s1", "Full Cream Milk", "2 L", 1, "3.45", "#1d4ed8"), item("i6", "s2", "Frozen Garden Peas", "1 kg", 2, "4.20", "#4d7c0f"), item("i7", "s2", "Pistachio Gelato", "500 mL", 1, "10.45", "#65a30d")]
const ORDER = {
  id: "o1", orderNumber: "EFY-10482", status: "paid", stage: st === "delivered" ? "delivered" : "packing", placedAt: at(300), createdAt: at(300),
  deliveryType: "effy", deliveryTypeReason: "in_coverage", courierEstimate: null, promise: "window", asapEstimate: null, courierCollection: null,
  customerId: "c1", customerEmail: "mia.thompson@example.com", customerName: "Mia Thompson", customerOrderCount: 7,
  items, packages: [p1, p2], itemSubtotalAmount: "68.00", deliveryFeeAmount: "6.90",
  deliveryFeeBreakdown: { v: 1, kind: "effy", plan: { id: "pl", name: "Metro" }, inputs: { km: 3.2, grams: 6400, basketCents: 6800, slotId: "s", windowIsToday: true }, parts: { baseCents: 350, distanceCents: 100, distanceBandUpperKm: 5, weightCents: 40, weightBandUpperGrams: 10000, premiumCents: 200, rawCents: 690, roundedCents: 690, clamp: null, deliveryCents: 690, freeApplied: false, smallOrderCents: 0 }, lines: [] },
  discountAmount: "5.00", promoCode: "FRESH5", promotions: [], deliveryDiscountAmount: "0.00", grandTotalAmount: "69.90", currency: "AUD",
  paymentStatus: "succeeded", paymentMethod: { type: "card", brand: "Visa", last4: "4242" },
  paymentSplit: { pointsUsed: 1000, pointsAmount: "10.00", cardAmount: "59.90", pointsReturned: 0, cardRefunded: "0.00", pointsRefunded: "0.00" },
  deliveryAddress: { recipientName: "Mia Thompson", line1: "Unit 4, 18 Rathdowne Street", city: "Carlton", region: "VIC", postalCode: "3053", country: "AU" }, billingAddress: null,
  deliveryInstructions: { handover: "leave_at_door", note: "Leave with the concierge. Buzzer 4." },
  finished: st === "delivered", awaiting: null, refunds: [], refundedAmount: "0.00", refundableAmount: "69.90",
  refundableLines: items.map((i) => ({ orderItemId: i.orderItemId, productName: i.productName, variantLabel: i.variantLabel, unitPriceAmount: i.unitPriceAmount, quantity: i.quantity })),
  proposedRefunds: [], refundRequest: st === "delivered" ? { id: "rq", message: "The yoghurt lid was split and it leaked over the bag.", status: "open", items: [{ orderItemId: "i4", productName: "Jalna Greek Yoghurt Natural", quantity: 1 }], outcomeNote: null, createdAt: at(5), decidedAt: null } : null,
}
const LIST = { items: ["o0", "o1", "o2"].map((id) => ({ id })), total: 14, pageSize: 25, totalCapped: false, page: null, nextCursor: null, ignored: [] }

vi.mock("@/lib/api", () => ({
  api: {
    get: async (path: string) =>
      path.startsWith("/orders/v1/orders/o") ? ORDER : path.startsWith("/orders/v1/orders?") ? LIST : new Promise(() => {}),
    post: () => new Promise(() => {}),
    put: () => new Promise(() => {}),
    patch: () => new Promise(() => {}),
    delete: () => new Promise(() => {}),
  },
}))

import { CustomerOrderPreview } from "./components/CustomerOrderPreview"
import { OrderDetailScreen } from "./OrderDetailScreen"

function renderOrder() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(["auth", "session"], { status: "signed-in", identity: { roles: ["admin"] } })
  const root = createRootRoute()
  const page = createRoute({ getParentRoute: () => root, path: "/orders/$orderId", component: () => <OrderDetailScreen orderId="o1" /> })
  const anything = createRoute({ getParentRoute: () => root, path: "$", component: () => null })
  const router = createRouter({ routeTree: root.addChildren([page, anything]), history: createMemoryHistory({ initialEntries: ["/orders/o1"] }) })
  return render(
    <QueryClientProvider client={qc}>
      <ActionBarProvider>
        <RouterProvider router={router} />
      </ActionBarProvider>
    </QueryClientProvider>,
  )
}

describe("the order page", () => {
  it("draws each package's journey, in the nine words, with the step it is at", async () => {
    renderOrder()
    const journeys = await screen.findAllByRole("list", { name: "Where it is" })
    expect(journeys).toHaveLength(2)
    expect(within(journeys[0]!).getByText("Preparing").closest("li")).toHaveAttribute("aria-current", "step")
    expect(within(journeys[1]!).getByText("Ready").closest("li")).toHaveAttribute("aria-current", "step")
  })

  it("puts its place in the order list, previous / next and its actions on the action bar", async () => {
    renderOrder()
    const bar = await screen.findByRole("region", { name: "Order" })
    await waitFor(() => expect(bar).toHaveTextContent("2 of 14"))
    expect(within(bar).getByRole("button", { name: "Previous order (←)" })).toBeEnabled()
    expect(within(bar).getByRole("button", { name: "Next order (→)" })).toBeEnabled()
    expect(within(bar).getByRole("button", { name: /Issue a refund/ })).toBeInTheDocument()
  })

  it("hands the bar to ticked lines, and back once they go to the refund", async () => {
    renderOrder()
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Sourdough Loaf" }))
    const bar = screen.getByRole("region", { name: "Selected lines" })
    expect(bar).toHaveTextContent("1 selected")
    await userEvent.click(within(bar).getByRole("button", { name: "Refund this line…" }))
    await waitFor(() => expect(screen.getByRole("region", { name: "Order" })).toHaveTextContent("2 of 14"))
    expect(screen.getByRole("heading", { name: "Issue a refund" })).toBeInTheDocument()
  })

  it("says what the customer sees, in their words, and never names a shop there", () => {
    // The rail is a drawer at a test's width, so the preview is drawn on its own.
    render(<CustomerOrderPreview order={ORDER as never} />)
    const preview = screen.getByLabelText("The customer's order screen")
    expect(preview).toHaveTextContent("Being packed")
    expect(preview).not.toHaveTextContent("Carlton Fresh Market")
    expect(preview).not.toHaveTextContent("Lygon Street Grocer")
  })
})
