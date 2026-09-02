import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductStockDetailDTO, SupplierDTO } from "@effy/shared-types"

/**
 * 057 — the rebuilt Inventory section and the two writes it puts behind named verbs.
 *
 * ⚠ THESE REPLACE `StockPanel.test.tsx`, WHICH TESTED A COMPONENT THAT NO LONGER EXISTS. Everything
 * that file asserted about behaviour is asserted here against the new shape: the FR-003 opening-count
 * rule, the threshold's shop-default fallback, the untracked state, and that a refusal reaches the
 * operator in the server's own words rather than one generic sentence (053).
 */

const getProductStock = vi.hoisted(() => vi.fn())
const setStockCount = vi.hoisted(() => vi.fn())
const adjustStock = vi.hoisted(() => vi.fn())
const setStockTracking = vi.hoisted(() => vi.fn())
const setStockThreshold = vi.hoisted(() => vi.fn())

vi.mock("../stockRepo", () => ({
  getProductStock,
  setStockCount,
  adjustStock,
  setStockTracking,
  setStockThreshold,
  getStockSettings: vi.fn(),
  setStockSettings: vi.fn(),
  getLowStock: vi.fn(),
}))

const listSuppliers = vi.hoisted(() => vi.fn())
const setProductSupplier = vi.hoisted(() => vi.fn())

vi.mock("@/features/restock/repo", () => ({
  listSuppliers,
  setProductSupplier,
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  archiveSupplier: vi.fn(),
  listPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  receivePurchaseOrder: vi.fn(),
}))

const { InventorySection } = await import("../InventorySection")
const { AdjustStockDialog, ReceiveStockDialog } = await import("../StockDialogs")
const { InventoryRulesDialog } = await import("../InventoryRulesDialog")

import type { ProductDetail } from "../model"

function stockDetail(over: Partial<ProductStockDetailDTO["stock"]> = {}): ProductStockDetailDTO {
  return {
    stock: {
      productId: "p1",
      tracked: true,
      onHand: 12,
      threshold: null,
      effectiveThreshold: null,
      outOfStock: false,
      low: false,
      ...over,
    },
    movements: [],
  }
}

const PRODUCT = {
  id: "p1",
  name: "Barossa Free-Range Eggs 700g",
  sku: "EGG-700",
  gtin: null,
  status: "active",
  supplierId: null,
  supplierName: null,
  media: [],
  sections: [],
  attributes: [],
  missingMandatoryAttributes: [],
  updatedAt: "2026-09-02T00:00:00.123456Z",
} as unknown as ProductDetail

const SUPPLIERS: SupplierDTO[] = [
  {
    id: "sup-1",
    name: "Riverina Produce",
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "sup-2",
    name: "Old Dairy Co",
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "archived",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
]

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  getProductStock.mockResolvedValue(stockDetail())
  setStockCount.mockResolvedValue(stockDetail())
  adjustStock.mockResolvedValue(stockDetail())
  setStockTracking.mockResolvedValue(stockDetail())
  setStockThreshold.mockResolvedValue(stockDetail())
  listSuppliers.mockResolvedValue(SUPPLIERS)
  setProductSupplier.mockResolvedValue(undefined)
})

// ── The section states the numbers ───────────────────────────────────────────────────────────────

describe("the Inventory section", () => {
  it("states the count, and says where the threshold came from", async () => {
    // ⚠ A shop default and a per-product override produce the same figure and mean different things:
    // change the shop default and one of them moves. A row that shows only "8" cannot be predicted.
    getProductStock.mockResolvedValue(
      stockDetail({ onHand: 9, threshold: null, effectiveThreshold: 8 }),
    )
    wrap(<InventorySection detail={PRODUCT} />)

    expect(await screen.findByText("9 units")).toBeInTheDocument()
    expect(screen.getByText(/8 — the shop default/)).toBeInTheDocument()
  })

  it("names a per-product threshold as this product's own", async () => {
    getProductStock.mockResolvedValue(
      stockDetail({ onHand: 9, threshold: 4, effectiveThreshold: 4 }),
    )
    wrap(<InventorySection detail={PRODUCT} />)
    expect(await screen.findByText(/4 — set for this product/)).toBeInTheDocument()
  })

  it("shows the default supplier, and 'Not set' is a real answer rather than a blank", async () => {
    // 057's own migration: NULL is expected and supported. A blank cell reads as a loading failure.
    wrap(<InventorySection detail={PRODUCT} />)
    expect(await screen.findByText("Not set")).toBeInTheDocument()

    wrap(<InventorySection detail={{ ...PRODUCT, supplierId: "sup-1", supplierName: "Riverina Produce" }} />)
    expect(await screen.findAllByText("Riverina Produce")).not.toHaveLength(0)
  })

  it("says an empty shelf is unbuyable, in words and weight rather than a hue", async () => {
    getProductStock.mockResolvedValue(stockDetail({ onHand: 0, outOfStock: true }))
    wrap(<InventorySection detail={PRODUCT} />)

    const line = await screen.findByText(/out of stock — shoppers cannot buy this right now/i)
    // ⚠ 041 stripped an amber "warning" colour out of these very screens and the platform has exactly
    // two semantic colours, neither meaning "running low". The emphasis must be weight.
    expect(line.className).toMatch(/font-semibold/)
    expect(line.className).not.toMatch(/text-(destructive|amber|yellow|orange|red)/)
  })

  it("withholds the count and the adjustment when stock is not tracked", async () => {
    // An untracked product behaves exactly as it did before 054 existed (FR-002) — there is no count
    // to show, and the server answers a write with a 409.
    getProductStock.mockResolvedValue(stockDetail({ tracked: false, onHand: null }))
    wrap(<InventorySection detail={PRODUCT} />)

    expect(await screen.findByText(/can be bought without limit/i)).toBeInTheDocument()
    expect(screen.queryByText(/units on hand/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /adjust stock/i })).toBeDisabled()
  })
})

// ── Receiving ────────────────────────────────────────────────────────────────────────────────────

describe("receiving stock", () => {
  it("adds units with reason 'received' and shows the arithmetic before the write", async () => {
    wrap(
      <ReceiveStockDialog
        productId="p1"
        stock={stockDetail({ onHand: 12 }).stock}
        open
        onOpenChange={() => {}}
      />,
    )

    await userEvent.type(screen.getByLabelText(/units received/i), "24")
    // ⚠ Shown BEFORE committing. It is the only thing standing between a mistyped 240 and a shelf
    // count nobody questions afterwards.
    expect(screen.getByText("12 → 36")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /add to stock/i }))
    await waitFor(() => expect(adjustStock).toHaveBeenCalled())
    expect(adjustStock.mock.calls[0]![1]).toMatchObject({ delta: 24, reason: "received" })
  })

  it("refuses a blank, a fraction and a negative rather than sending them", async () => {
    wrap(
      <ReceiveStockDialog productId="p1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    const button = screen.getByRole("button", { name: /add to stock/i })
    const input = screen.getByLabelText(/units received/i)

    expect(button).toBeDisabled()
    for (const bad of ["1.5", "-4", "12abc", "0"]) {
      await userEvent.clear(input)
      await userEvent.type(input, bad)
      expect(button, `"${bad}" must not be receivable`).toBeDisabled()
    }
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it("points at the purchase order rather than imitating it with free text", async () => {
    // ⚠ The mockup's receive sheet has Supplier and Reference boxes. 057 already built the honest
    // version — receiving against a purchase order writes `stock_movement.purchase_order_line_id` —
    // and two free-text boxes here would record the same intent as unjoinable prose while leaving the
    // operator believing the order had been reconciled.
    wrap(
      <ReceiveStockDialog productId="p1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    expect(screen.queryByLabelText(/^supplier$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^reference$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/restock screen/i)).toBeInTheDocument()
  })

  it("shows the server's own refusal, not one generic sentence", async () => {
    // 053: the console collapsed every refusal because it tested `e instanceof Error` while the api
    // client throws a PLAIN OBJECT. `stockErrorText` keys off structure so that cannot happen here.
    adjustStock.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Conflict",
      detail: "internal wording that must never be rendered",
    })
    wrap(
      <ReceiveStockDialog productId="p1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    await userEvent.type(screen.getByLabelText(/units received/i), "5")
    await userEvent.click(screen.getByRole("button", { name: /add to stock/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/not being tracked/i)
    expect(alert).not.toHaveTextContent(/internal wording/)
  })
})

// ── Adjusting ────────────────────────────────────────────────────────────────────────────────────

describe("adjusting stock", () => {
  it("writes an absolute count when the operator counted the shelf", async () => {
    wrap(
      <AdjustStockDialog
        productId="p1"
        stock={stockDetail({ onHand: 12 }).stock}
        open
        onOpenChange={() => {}}
      />,
    )
    await userEvent.type(screen.getByLabelText(/new count/i), "9")
    await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }))

    await waitFor(() => expect(setStockCount).toHaveBeenCalled())
    expect(setStockCount.mock.calls[0]![1]).toMatchObject({ onHand: 9, reason: "correction" })
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it("writes a signed delta when the operator knows the movement but not the count", async () => {
    // ⚠ Both modes are kept because they answer different questions. "Three were dropped" must not
    // require knowing a current count that a sale may have moved while they walked back from the aisle.
    const user = userEvent.setup()
    wrap(
      <AdjustStockDialog
        productId="p1"
        stock={stockDetail({ onHand: 12 }).stock}
        open
        onOpenChange={() => {}}
      />,
    )
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "-3")
    expect(screen.getByText("12 → 9")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /save adjustment/i }))
    await waitFor(() => expect(adjustStock).toHaveBeenCalled())
    expect(adjustStock.mock.calls[0]![1]).toMatchObject({ delta: -3 })
    expect(setStockCount).not.toHaveBeenCalled()
  })

  it("refuses a zero delta — a movement that moves nothing has no fact behind it", async () => {
    const user = userEvent.setup()
    wrap(
      <AdjustStockDialog productId="p1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "0")

    expect(screen.getByRole("button", { name: /save adjustment/i })).toBeDisabled()
  })

  it("previews the server's floor at zero rather than promising a negative shelf", async () => {
    // The floor lives in the STATEMENT (`GREATEST(0, …)`), so a preview of "5 → -3" would show the
    // operator a number the database will never write.
    const user = userEvent.setup()
    wrap(
      <AdjustStockDialog
        productId="p1"
        stock={stockDetail({ onHand: 5 }).stock}
        open
        onOpenChange={() => {}}
      />,
    )
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "-8")
    expect(screen.getByText("5 → 0")).toBeInTheDocument()
  })
})

// ── The standing rules ───────────────────────────────────────────────────────────────────────────

describe("inventory rules", () => {
  function openRules(over: Partial<ProductStockDetailDTO["stock"]> = {}, product = PRODUCT) {
    return wrap(
      <InventoryRulesDialog
        detail={product}
        stock={stockDetail(over).stock}
        open
        onOpenChange={() => {}}
      />,
    )
  }

  it("will not start tracking without an opening count (FR-003)", async () => {
    // Turning tracking on with no count makes the product instantly unbuyable with no operator intent
    // behind it — a state the shop hears about from a customer rather than from their own action.
    const user = userEvent.setup()
    openRules({ tracked: false, onHand: null })

    await user.click(screen.getByLabelText(/track stock for this product/i))
    expect(await screen.findByLabelText(/opening count/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /save rules/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/opening count/i), "24")
    expect(screen.getByRole("button", { name: /save rules/i })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: /save rules/i }))
    await waitFor(() => expect(setStockTracking).toHaveBeenCalled())
    expect(setStockTracking.mock.calls[0]![1]).toMatchObject({ tracked: true, onHand: 24 })
  })

  it("sends only the rule that actually changed", async () => {
    // ⚠ A write that resends untouched fields is how one operator's save silently reverts another's.
    const user = userEvent.setup()
    openRules({ tracked: true, onHand: 12, threshold: null, effectiveThreshold: 8 })

    await user.type(screen.getByLabelText(/low-stock threshold/i), "4")
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setStockThreshold).toHaveBeenCalled())
    expect(setStockThreshold.mock.calls[0]![1]).toEqual({ threshold: 4 })
    expect(setStockTracking).not.toHaveBeenCalled()
    expect(setProductSupplier).not.toHaveBeenCalled()
  })

  it("clears a threshold back to the shop default rather than making it permanent", async () => {
    const user = userEvent.setup()
    openRules({ tracked: true, onHand: 12, threshold: 4, effectiveThreshold: 4 })

    await user.clear(screen.getByLabelText(/low-stock threshold/i))
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setStockThreshold).toHaveBeenCalled())
    expect(setStockThreshold.mock.calls[0]![1]).toEqual({ threshold: null })
  })

  it("assigns a supplier — the write 057 shipped with no call site at all", async () => {
    const user = userEvent.setup()
    openRules()

    await user.click(await screen.findByLabelText(/default supplier/i))
    await user.click(await screen.findByRole("option", { name: "Riverina Produce" }))
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setProductSupplier).toHaveBeenCalled())
    expect(setProductSupplier).toHaveBeenCalledWith("p1", "sup-1")
  })

  it("offers a supplier that is retired on no picker", async () => {
    // ⚠ Soft-retirement is the whole point of `supplier.status`: an archived supplier stays readable
    // on historical purchase orders and disappears from the assignment picker.
    const user = userEvent.setup()
    openRules()
    await user.click(await screen.findByLabelText(/default supplier/i))
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).queryByText("Old Dairy Co")).not.toBeInTheDocument()
  })

  it("clears an assigned supplier with an explicit null", async () => {
    // 056 shipped a profile field that could never be emptied because COALESCE cannot tell "leave
    // alone" from "clear". The supplier route takes an explicit null precisely so this works.
    const user = userEvent.setup()
    openRules({}, { ...PRODUCT, supplierId: "sup-1", supplierName: "Riverina Produce" })

    await user.click(await screen.findByLabelText(/default supplier/i))
    await user.click(await screen.findByRole("option", { name: /not set/i }))
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setProductSupplier).toHaveBeenCalled())
    expect(setProductSupplier).toHaveBeenCalledWith("p1", null)
  })

  it("turns tracking on BEFORE writing a threshold that depends on it", async () => {
    // ⚠ The server refuses a threshold write while tracking is off, so the reverse order turns one
    // operator action into a confusing refusal for a product that is by then tracked perfectly well.
    const user = userEvent.setup()
    const order: string[] = []
    setStockTracking.mockImplementation(async () => {
      order.push("tracking")
      return stockDetail()
    })
    setStockThreshold.mockImplementation(async () => {
      order.push("threshold")
      return stockDetail()
    })
    openRules({ tracked: false, onHand: null })

    await user.click(screen.getByLabelText(/track stock for this product/i))
    await user.type(await screen.findByLabelText(/opening count/i), "10")
    await user.type(screen.getByLabelText(/low-stock threshold/i), "3")
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(order).toEqual(["tracking", "threshold"]))
  })
})

// ── The header chip ──────────────────────────────────────────────────────────────────────────────

const { ProductStatusBadge } = await import("../components/ProductStatusBadge")

describe("the product state chip", () => {
  it("says the shelf is empty rather than that the product is active", async () => {
    // ⚠ A product whose shelf is empty is `active` in the database and UNBUYABLE in the shop. A chip
    // reading "active" beside an empty shelf answers a question nobody asked.
    wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />)
    expect(screen.getByText("Out of stock")).toBeInTheDocument()
    expect(screen.queryByText("active")).not.toBeInTheDocument()
  })

  it("says low stock when it is thin but still on sale", () => {
    wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 2, low: true }).stock} />)
    expect(screen.getByText("Low stock")).toBeInTheDocument()
  })

  it("falls back to the lifecycle label where the count is unknown", () => {
    // ⚠ The catalog table carries no per-row count. Degrading is right; inventing one is not.
    wrap(<ProductStatusBadge status="active" />)
    expect(screen.getByText("active")).toBeInTheDocument()
  })

  it("never lets stock relabel a product that is not on sale", () => {
    // "Out of stock" on an archived product implies restocking would put it back on sale.
    for (const status of ["draft", "unavailable", "archived"] as const) {
      const view = wrap(
        <ProductStatusBadge status={status} stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />,
      )
      expect(within(view.container).getByText(status)).toBeInTheDocument()
      expect(within(view.container).queryByText("Out of stock")).not.toBeInTheDocument()
    }
  })

  it("carries its state by weight, never by a hue", () => {
    // 041 removed amber from these screens and `--success` is a non-text indicator at 4.00:1, which
    // is exactly why it has no `-foreground` pair. Rendered in greyscale the chip must lose nothing.
    const view = wrap(
      <ProductStatusBadge status="active" stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />,
    )
    expect(within(view.container).getByText("Out of stock").className).not.toMatch(
      /(amber|yellow|orange|red|green|emerald)|bg-(success|destructive)/,
    )
  })
})
