import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { orderDetail, orderList } from "./__tests__/fixtures"
import type { OrderDetail, OrderLine } from "./orderConsole"

// The address, as the activity drawer reads and writes it (104).
const router = vi.hoisted(() => ({ search: {} as Record<string, unknown>, navigate: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { search: router.search, state: {} } }),
}))

const apiGet = vi.hoisted(() => vi.fn())
vi.mock("@/lib/api", () => ({ api: { get: apiGet } }))

const getOrder = vi.hoisted(() => vi.fn())
const listOrders = vi.hoisted(() => vi.fn())
const setOrderPicks = vi.hoisted(() => vi.fn())
const transitionFulfillment = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({
  getOrder,
  listOrders,
  setOrderPicks,
  transitionFulfillment,
  setOrderTags: vi.fn(),
  addOrderNote: vi.fn(),
  issueShopRefund: vi.fn(),
  listFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
}))

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }))
vi.mock("@/features/auth/queries", () => ({ sessionQuery }))

import { OrderDetailScreen } from "./OrderDetailScreen"

/** Every loading shape has gone - a skeleton writes the page's real titles, so a title alone does not mean loaded. */
const loaded = () => waitFor(() => expect(screen.queryAllByRole("status", { busy: true })).toHaveLength(0))

const EGGS = orderDetail().lines[0]!
function line(over: Partial<OrderLine> = {}): OrderLine {
  return { ...EGGS, ...over }
}
const MILK = line({
  orderItemId: "oi2",
  name: "Oat milk 1L",
  sku: "OAT-1L",
  orderedQuantity: 3,
  gatheredQuantity: 0,
  unitPrice: "3.00",
  lineTotal: "9.00",
})

function wrap(children: ReactNode, roles: string[] = ["shop_staff"]) {
  // A desktop window: the rail docks beside the page (below 1280px it is a drawer).
  window.innerWidth = 1600
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(["session"], { status: "signed-in", identity: { subject: "s1", email: "x@y.z", roles } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

function open(d: OrderDetail = orderDetail(), roles?: string[]) {
  getOrder.mockResolvedValue(d)
  listOrders.mockResolvedValue(orderList([]))
  return wrap(<OrderDetailScreen fulfillmentId={d.id} />, roles)
}

afterEach(() => {
  vi.clearAllMocks()
  router.search = {}
})

describe("the summary bar", () => {
  it("shows the total, the pills and 'placed · channel'", async () => {
    open(orderDetail({ atRisk: true, payment: { ...orderDetail().payment, state: "partially_refunded" } }))
    // The pill is the shared status ("Preparing" covers new, received and picking).
    expect((await screen.findAllByText("Preparing")).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Partially refunded").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("At risk")).toBeInTheDocument()
    expect(screen.getByText(/ · Online store ·/)).toBeInTheDocument()
    // The code on the package's label.
    expect(screen.getByLabelText("Package code")).toHaveTextContent("7K3Q9M")
  })

  it("089 - offers a label for the bag, at a remembered size", async () => {
    open()
    expect(await screen.findByRole("button", { name: "Print label" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Label size" })).toBeInTheDocument()
  })

  it("offers the next step on the action bar, the rest under More - and none of the controls Effy cannot perform", async () => {
    open()
    const bar = await screen.findByRole("region", { name: "Order" })
    expect(within(bar).getByRole("button", { name: /mark ready/i })).toBeInTheDocument()
    expect(within(bar).getByRole("button", { name: /can't supply/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument()
    for (const name of [
      /capture/i,
      /duplicate/i,
      /resend email/i,
      /print invoice/i,
      /edit order/i,
      /record a return/i,
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
  })

  it("puts its place in the order list and previous / next on the action bar", async () => {
    const d = orderDetail()
    getOrder.mockResolvedValue(d)
    listOrders.mockResolvedValue(orderList([{ id: "a" }, { id: d.id }, { id: "c" }] as never, { total: 3 }))
    wrap(<OrderDetailScreen fulfillmentId={d.id} />)
    const bar = await screen.findByRole("region", { name: "Order" })
    await waitFor(() => expect(bar).toHaveTextContent("2 of 3"))
    expect(within(bar).getByRole("button", { name: "Previous order (←)" })).toBeEnabled()
    await userEvent.click(within(bar).getByRole("button", { name: "Next order (→)" }))
    expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/orders/$fulfillmentId", params: { fulfillmentId: "c" } }))
  })

  it("disables the arrow at the end of the list", async () => {
    const d = orderDetail()
    getOrder.mockResolvedValue(d)
    listOrders.mockResolvedValue(orderList([{ id: "a" }, { id: d.id }] as never, { total: 2 }))
    wrap(<OrderDetailScreen fulfillmentId={d.id} />)
    const bar = await screen.findByRole("region", { name: "Order" })
    await waitFor(() => expect(bar).toHaveTextContent("2 of 2"))
    expect(within(bar).getByRole("button", { name: "Next order (→)" })).toBeDisabled()
  })

  it("shows a shop-scoped, non-disclosing refusal", async () => {
    getOrder.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" })
    listOrders.mockResolvedValue(orderList([]))
    wrap(<OrderDetailScreen fulfillmentId="f1" />)
    expect(await screen.findByText(/isn't available to your shop/i)).toBeInTheDocument()
  })
})

describe("layout", () => {
  it("puts the Pick list, Bags & labels (096) and Team notes in the main column, then where it is, Customer and delivery and Payment on the rail", async () => {
    open()
    await loaded()
    const titles = screen.getAllByRole("heading").map((h) => h.textContent)
    for (const t of ["Pick list", "Bags & labels", "Team notes", "Where it is", "Customer", "Your money", "Tags"]) {
      expect(titles).toContain(t)
    }
    expect(screen.queryByRole("heading", { name: "Fulfilment" })).not.toBeInTheDocument()
    // The activity log is a sheet, not a section.
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument()
  })

  it('keeps the payment on the rail - and calls the shop\'s one way out "Can\'t supply it", never "Cancel order"', async () => {
    open(orderDetail({ tags: ["fragile"] }))
    expect(await screen.findByText("Visa •••• 4242 · AUD 57.80 captured at checkout")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "More actions" }))
    expect(await screen.findByRole("menuitem", { name: /print pick list/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /can't supply it/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument()
  })

  it("says who the customer is and who collects it, with the bill-to address withheld; tags apart", async () => {
    open(orderDetail({ tags: ["fragile"] }))
    await loaded()
    const customer = screen.getByRole("heading", { name: "Customer" }).closest("section")!
    for (const label of ["Name", "Phone", "Goes with", "Ship to"]) {
      expect(within(customer).getByText(label)).toBeInTheDocument()
    }
    expect(within(customer).getByText(/bill-to address is held by Effy with the payment/)).toBeInTheDocument()
    const tags = screen.getByRole("heading", { name: "Tags" }).closest("section")!
    expect(within(tags).getByText("fragile")).toBeInTheDocument()
    expect(within(tags).getByRole("button", { name: "Edit" })).toBeInTheDocument()
  })

  it("says so when there are no notes, rather than collapsing to a bare rule", async () => {
    open()
    expect(await screen.findByText("No notes on this order yet.")).toBeInTheDocument()
  })

  it("shows this shop's items only on a two-shop order, with no tax row", async () => {
    open()
    await loaded()
    expect(screen.queryByText("Items from other shops")).not.toBeInTheDocument()
    expect(screen.queryByText("AUD 30.00")).not.toBeInTheDocument()
    expect(document.body.textContent ?? "").not.toMatch(/\b(VAT|GST)\b/)
    // No delivery or shipping amount reaches a shop.
    expect(screen.queryByText("Shipping")).toBeNull()
    expect(screen.queryByText(/delivery fee/i)).toBeNull()
  })
})

describe("walking order (099)", () => {
  it("groups the pick list Ambient → Chilled → Frozen, with no empty group", async () => {
    open(
      orderDetail({
        lines: [
          line({ orderItemId: "f", name: "Ice cream", storageClass: "frozen" }),
          line({ orderItemId: "a", name: "Bread", storageClass: "ambient" }),
        ],
      }),
    )
    const groups = await screen.findAllByRole("region", { name: /^(Ambient|Chilled|Frozen)$/ })
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Ambient", "Frozen"])
    expect(within(groups[0]!).getByText("Bread")).toBeInTheDocument()
    expect(within(groups[1]!).getByText("Ice cream")).toBeInTheDocument()
  })
})

describe("item-level picking", () => {
  it("summarises lines picked in full, and labels each line's state", async () => {
    open(
      orderDetail({
        lines: [
          line({ gatheredQuantity: 2 }),
          line({
            orderItemId: "oi2",
            name: "Oat milk 1L",
            orderedQuantity: 3,
            gatheredQuantity: 1,
            unavailableQuantity: 2,
          }),
          line({
            orderItemId: "oi3",
            name: "Bread",
            gatheredQuantity: 0,
            unavailableQuantity: 2,
            pickNote: "supplier short",
          }),
          line({ orderItemId: "oi4", name: "Tea", gatheredQuantity: 0 }),
        ],
      }),
    )
    expect(await screen.findByText("3 of 4 lines · 2 short")).toBeInTheDocument()
    expect(screen.getByText("Picked 2")).toBeInTheDocument()
    expect(screen.getByText("1 of 3 · 2 short")).toBeInTheDocument()
    expect(screen.getByText("Can't supply")).toBeInTheDocument()
    expect(screen.getByText("“supplier short”")).toBeInTheDocument()
    // The one line still to pick is the next one, with its own Picked.
    expect(screen.getByRole("button", { name: "Mark Tea picked" })).toBeInTheDocument()
    expect(screen.getByText("Next")).toBeInTheDocument()
  })

  it("one click marks the whole line picked - no steppers", async () => {
    setOrderPicks.mockResolvedValue(orderDetail())
    open(orderDetail({ lines: [line({ gatheredQuantity: 0 })] }))
    await userEvent.click(await screen.findByRole("button", { name: /mark barossa .* picked/i }))
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi1", mode: "full" }] })
    expect(screen.queryByRole("button", { name: /more gathered|fewer gathered/i })).not.toBeInTheDocument()
  })

  it("Undo on a picked line clears it", async () => {
    setOrderPicks.mockResolvedValue(orderDetail())
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 })] }))
    await userEvent.click(await screen.findByRole("button", { name: /undo barossa/i }))
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi1", mode: "none" }] })
  })

  it("Select all picks every line, and the label flips to Clear all", async () => {
    setOrderPicks.mockResolvedValue(orderDetail())
    open(orderDetail({ lines: [line({ gatheredQuantity: 0 }), MILK] }))
    await userEvent.click(await screen.findByRole("button", { name: "Select all" }))
    expect(setOrderPicks).toHaveBeenCalledWith("f1", {
      lines: [
        { orderItemId: "oi1", mode: "full" },
        { orderItemId: "oi2", mode: "full" },
      ],
    })

    vi.clearAllMocks()
    open(orderDetail({ id: "f2", lines: [line({ gatheredQuantity: 2 })] }))
    expect(await screen.findByRole("button", { name: "Clear all" })).toBeInTheDocument()
  })

  it("locks the boxes once the order has left picking", async () => {
    open(orderDetail({ status: "ready_for_pickup", lines: [line({ gatheredQuantity: 2 })] }))
    expect(await screen.findByText("Picked 2")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /undo barossa/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /other outcomes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument()
  })

  it("shows the handover as a Shipments row once ready", async () => {
    open(orderDetail({ status: "ready_for_pickup", lines: [line({ gatheredQuantity: 2 })] }))
    expect(await screen.findByText("Shipments")).toBeInTheDocument()
    expect(screen.getByText(/^Ready for pickup · /)).toBeInTheDocument()
    expect(screen.getByText("Barossa Free-Range Eggs 700g ×2")).toBeInTheDocument()
  })
})

describe("Adjust this line", () => {
  async function openAdjust(d = orderDetail({ lines: [MILK] })) {
    setOrderPicks.mockResolvedValue(orderDetail())
    open(d)
    await userEvent.click(await screen.findByRole("button", { name: "Other outcomes for Oat milk 1L" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /adjust with a note/i }))
    return screen.findByRole("dialog")
  }

  it("has the design's title, description and fields", async () => {
    const dialog = await openAdjust()
    expect(within(dialog).getByText("Adjust this line")).toBeInTheDocument()
    expect(within(dialog).getByText("Use this when the line cannot simply be marked picked.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Availability")).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText("Optional - what happened with this line")).toBeInTheDocument()
    // Units only for Part picked.
    expect(within(dialog).queryByLabelText("Units picked")).not.toBeInTheDocument()
  })

  it("validates Units picked: required, at least 1, not more than ordered", async () => {
    const dialog = await openAdjust()
    await userEvent.click(within(dialog).getByRole("radio", { name: /found some/i }))
    expect(within(dialog).getByText("Out of 3 ordered.")).toBeInTheDocument()
    const units = within(dialog).getByLabelText("Units picked")

    await userEvent.type(units, "0")
    expect(within(dialog).getByText("Use Unavailable instead of 0.")).toBeInTheDocument()
    expect(units).toHaveAttribute("aria-invalid", "true")

    await userEvent.clear(units)
    await userEvent.type(units, "5")
    expect(within(dialog).getByText("Only 3 ordered.")).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }))
    expect(setOrderPicks).not.toHaveBeenCalled()
  })

  it("saves a part pick with its note", async () => {
    const dialog = await openAdjust()
    await userEvent.click(within(dialog).getByRole("radio", { name: /found some/i }))
    await userEvent.type(within(dialog).getByLabelText("Units picked"), "2")
    await userEvent.type(within(dialog).getByLabelText("Note for the team"), "one cracked")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }))
    await waitFor(() =>
      expect(setOrderPicks).toHaveBeenCalledWith("f1", {
        lines: [{ orderItemId: "oi2", mode: "part", units: 2, note: "one cracked" }],
      }),
    )
  })

  it("saves Unavailable without units", async () => {
    const dialog = await openAdjust()
    await userEvent.click(within(dialog).getByRole("radio", { name: /can't find any/i }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save line" }))
    await waitFor(() =>
      expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi2", mode: "unavailable" }] }),
    )
  })
})

describe("Mark ready", () => {
  it("opens the hand-over check from the action bar - marking untouched lines unavailable first", async () => {
    setOrderPicks.mockResolvedValue(orderDetail())
    transitionFulfillment.mockResolvedValue({
      id: "f1",
      orderNumber: "EFY-10023",
      status: "ready_for_pickup",
      items: [],
    })
    open(orderDetail({ lines: [line({ gatheredQuantity: 2 }), MILK] }))
    const bar = await screen.findByRole("region", { name: "Order" })
    await userEvent.click(within(bar).getByRole("button", { name: /mark ready/i }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("In this parcel")).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/carrier|tracking/i)).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: "Mark ready for pickup" }))
    await waitFor(() => expect(transitionFulfillment).toHaveBeenCalledWith("f1", { to: "ready_for_pickup" }))
    expect(setOrderPicks).toHaveBeenCalledWith("f1", { lines: [{ orderItemId: "oi2", mode: "unavailable" }] })
    expect(setOrderPicks.mock.invocationCallOrder[0]!).toBeLessThan(transitionFulfillment.mock.invocationCallOrder[0]!)
  })

  it("offers Reopen picking once it is ready", async () => {
    open(orderDetail({ status: "ready_for_pickup" }))
    const bar = await screen.findByRole("region", { name: "Order" })
    expect(within(bar).getByRole("button", { name: /reopen picking/i })).toBeInTheDocument()
    expect(within(bar).queryByRole("button", { name: /mark ready/i })).not.toBeInTheDocument()
  })
})

describe("the activity drawer (104)", () => {
  it("opens from the action row through the address, and reads nothing before", async () => {
    open()
    await loaded()
    expect(apiGet).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Activity" }))
    const opened = router.navigate.mock.calls[0]![0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(opened.search({ tab: "picking" })).toEqual({ tab: "picking", log: 1 })
  })

  it("lists the order's own log - what, who, when - from its route", async () => {
    router.search = { log: 1 }
    apiGet.mockResolvedValue({
      items: [
        {
          id: "e1",
          at: "2026-09-10T02:30:00Z",
          kind: "picking",
          title: "Oat milk - marked unavailable · supplier short",
          detail: null,
          subject: null,
          actor: "Sam",
          tone: "problem",
        },
      ],
      pageSize: 25,
      total: 1,
      totalCapped: false,
      page: null,
      nextCursor: null,
      ignored: [],
    })
    open()
    const drawer = await screen.findByRole("dialog")
    expect(within(drawer).getByText(/everything that has happened on this order/i)).toBeInTheDocument()
    expect(await within(drawer).findByText("Oat milk - marked unavailable · supplier short")).toBeInTheDocument()
    expect(within(drawer).getByText("Sam")).toBeInTheDocument()
    expect(String(apiGet.mock.calls[0]![0])).toMatch(/^\/shop\/v1\/orders\/[^/]+\/activity\?/)
    expect(within(drawer).getByRole("button", { name: "Export CSV" })).toBeInTheDocument()
  })
})
