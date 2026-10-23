import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductStockDetailDTO } from "@effy/shared-types"

/**
 * The Inventory section and its writes: the opening-count rule, the threshold's shop-default fallback,
 * the untracked state, and a refusal said in the server's own reason.
 */

const getVariantStock = vi.hoisted(() => vi.fn())
const setStockCount = vi.hoisted(() => vi.fn())
const adjustStock = vi.hoisted(() => vi.fn())
const setStockTracking = vi.hoisted(() => vi.fn())
const setStockThreshold = vi.hoisted(() => vi.fn())

vi.mock("../stockRepo", () => ({
  getVariantStock,
  setStockCount,
  adjustStock,
  setStockTracking,
  setStockThreshold,
  getStockSettings: vi.fn(),
  setStockSettings: vi.fn(),
  getLowStock: vi.fn(),
}))

const { InventorySection, ReceiveStockButton } = await import("../InventorySection")
const { AdjustStockDialog, ReceiveStockDialog, StartTrackingDialog } = await import("../StockDialogs")
const { InventoryRulesDialog } = await import("../InventoryRulesDialog")
const { ProductActivitySheet } = await import("../ProductActivitySheet")

import type { ProductDetail } from "../model"

function stockDetail(over: Partial<ProductStockDetailDTO["stock"]> = {}): ProductStockDetailDTO {
  return {
    stock: {
      productId: "p1",
      variantId: "v1",
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
  // Stock is per size; this product is sold in one.
  options: [],
  variants: [{ id: "v1", state: "active", label: null, stock: {} }],
  name: "Barossa Free-Range Eggs 700g",
  sku: "EGG-700",
  gtin: null,
  status: "active",
  media: [],
  sections: [],
  attributes: [],
  missingMandatoryAttributes: [],
  updatedAt: "2026-09-02T00:00:00.123456Z",
} as unknown as ProductDetail

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  getVariantStock.mockResolvedValue(stockDetail())
  setStockCount.mockResolvedValue(stockDetail())
  adjustStock.mockResolvedValue(stockDetail())
  setStockTracking.mockResolvedValue(stockDetail())
  setStockThreshold.mockResolvedValue(stockDetail())
})

// The section states the numbers

/** A product in three sizes: counted with stock, counted and empty, and not counted yet. */
const SIZED = {
  ...PRODUCT,
  options: [{ id: "o1", position: 1, name: "Size", values: [] }],
  variants: [
    { id: "v1", state: "active", label: "500 g", code: "V2222222", stock: stockDetail({ variantId: "v1", onHand: 12, effectiveThreshold: 5 }).stock },
    { id: "v2", state: "active", label: "1 kg", code: "V3333333", stock: stockDetail({ variantId: "v2", onHand: 0, outOfStock: true }).stock },
    { id: "v3", state: "active", label: "5 kg", code: "V4444444", stock: stockDetail({ variantId: "v3", tracked: false, onHand: null }).stock },
  ],
} as unknown as ProductDetail

describe("the Inventory section — every size in one table (098)", () => {
  it("shows each size's count and its state in words", async () => {
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    const table = screen.getAllByRole("table")[0]!
    expect(within(table).getByText("500 g")).toBeInTheDocument()
    expect(within(table).getByText("In stock")).toBeInTheDocument()
    expect(within(table).getByText("Out of stock")).toBeInTheDocument()
    expect(within(table).getByText("Not counted")).toBeInTheDocument()
    expect(within(table).getByText("V3333333")).toBeInTheDocument()
  })

  it("adds a delivery to several sizes in one Save, starting the count of an uncounted one", async () => {
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    await userEvent.type(screen.getByLabelText(/units received for 500 g/i), "24")
    await userEvent.type(screen.getByLabelText(/units received for 5 kg/i), "6")
    // The new totals are shown before anything is written.
    expect(screen.getByText("36")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /save stock for 2 sizes/i }))
    await waitFor(() => expect(setStockTracking).toHaveBeenCalled())
    expect(adjustStock).toHaveBeenCalledWith("v1", { delta: 24, reason: "received" })
    expect(setStockTracking).toHaveBeenCalledWith("v3", { tracked: true, onHand: 6 })
    expect(setStockCount).not.toHaveBeenCalled()
  })

  it("a stocktake replaces counts, and writes nothing for a count that is already right", async () => {
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    await userEvent.click(screen.getByRole("tab", { name: /set count/i }))
    await userEvent.type(screen.getByLabelText(/units counted for 500 g/i), "12") // unchanged
    await userEvent.type(screen.getByLabelText(/units counted for 1 kg/i), "7")
    await userEvent.click(screen.getByRole("button", { name: /save stock for 1 size/i }))
    await waitFor(() => expect(setStockCount).toHaveBeenCalledTimes(1))
    expect(setStockCount).toHaveBeenCalledWith("v2", { onHand: 7, reason: "correction" })
  })

  it("a size the server refuses keeps its number and says why; the saved ones clear", async () => {
    adjustStock.mockImplementation(async (id: string) => {
      if (id === "v2") throw { kind: "conflict", status: 409, title: "Conflict" }
      return stockDetail()
    })
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    await userEvent.type(screen.getByLabelText(/units received for 500 g/i), "3")
    await userEvent.type(screen.getByLabelText(/units received for 1 kg/i), "4")
    await userEvent.click(screen.getByRole("button", { name: /save stock for 2 sizes/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.getByLabelText(/units received for 500 g/i)).toHaveValue("")
    expect(screen.getByLabelText(/units received for 1 kg/i)).toHaveValue("4")
  })

  it("refuses to save while any number is not a whole number", async () => {
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    await userEvent.type(screen.getByLabelText(/units received for 500 g/i), "2.5")
    expect(screen.getByRole("button", { name: /save stock/i })).toBeDisabled()
  })

  it("names a per-size threshold as this size's own in its rules (history below the table)", async () => {
    getVariantStock.mockResolvedValue(stockDetail({ onHand: 9, threshold: null, effectiveThreshold: 8 }))
    wrap(<InventorySection detail={SIZED} variantId="v1" onVariantChange={() => {}} />)
    expect(await screen.findByText(/stock movements — 500 g/i)).toBeInTheDocument()
  })

  it("withholds the adjustment when the chosen size is not counted", async () => {
    getVariantStock.mockResolvedValue(stockDetail({ variantId: "v3", tracked: false, onHand: null }))
    wrap(<InventorySection detail={SIZED} variantId="v3" onVariantChange={() => {}} />)
    expect(await screen.findByText(/this size is not counted/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /adjust stock/i })).toBeDisabled()
  })
})

// Receiving

describe("receiving stock", () => {
  it("adds units with reason 'received' and shows the arithmetic before the write", async () => {
    wrap(
      <ReceiveStockDialog
        variantId="v1"
        stock={stockDetail({ onHand: 12 }).stock}
        open
        onOpenChange={() => {}}
      />,
    )

    await userEvent.type(screen.getByLabelText(/units received/i), "24")
    // Shown before committing. It is the only thing standing between a mistyped 240 and a shelf
    // count nobody questions afterwards.
    expect(screen.getByText("12 → 36")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /add to stock/i }))
    await waitFor(() => expect(adjustStock).toHaveBeenCalled())
    expect(adjustStock.mock.calls[0]![1]).toMatchObject({ delta: 24, reason: "received" })
  })

  it("refuses a blank, a fraction and a negative rather than sending them", async () => {
    wrap(
      <ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
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

  it("does not imitate purchasing with free-text supplier and reference boxes", async () => {
    // The mockup's receive sheet has Supplier and Reference boxes. Where stock came from belongs to
    // purchasing (deferred to its own feature); two free-text boxes here would record that intent as
    // unjoinable prose while leaving the operator believing the delivery had been reconciled.
    wrap(
      <ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    expect(screen.queryByLabelText(/^supplier$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^reference$/i)).not.toBeInTheDocument()
  })

  it("shows the server's own refusal, not one generic sentence", async () => {
    // The console collapsed every refusal because it tested `e instanceof Error` while the api
    // client throws a plain object. `stockErrorText` keys off structure so that cannot happen here.
    adjustStock.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Conflict",
      detail: "internal wording that must never be rendered",
    })
    wrap(
      <ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    await userEvent.type(screen.getByLabelText(/units received/i), "5")
    await userEvent.click(screen.getByRole("button", { name: /add to stock/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/not being tracked/i)
    expect(alert).not.toHaveTextContent(/internal wording/)
  })
})

// Adjusting

describe("adjusting stock", () => {
  it("writes an absolute count when the operator counted the shelf", async () => {
    wrap(
      <AdjustStockDialog
        variantId="v1"
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
    // Both modes are kept because they answer different questions. "Three were dropped" must not
    // require knowing a current count that a sale may have moved while they walked back from the aisle.
    const user = userEvent.setup()
    wrap(
      <AdjustStockDialog
        variantId="v1"
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
      <AdjustStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "0")

    expect(screen.getByRole("button", { name: /save adjustment/i })).toBeDisabled()
  })

  it("previews the server's floor at zero rather than promising a negative shelf", async () => {
    // The floor lives in the statement (`GREATEST(0, …)`), so a preview of "5 → -3" would show the
    // operator a number the database will never write.
    const user = userEvent.setup()
    wrap(
      <AdjustStockDialog
        variantId="v1"
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

// Starting a count from the header

describe("the header stock action on an untracked product", () => {
  // Tracking is off by default, so this is the state most products are in — the header's
  // stock button used to be dead on nearly every product page, with its only explanation in a `title`
  // attribute no touch device shows. These assertions pin the replacement: the label says which
  // action is coming, and the action itself is reachable in one step.

  it("offers Add stock instead of a disabled Receive stock", async () => {
    getVariantStock.mockResolvedValue(stockDetail({ tracked: false, onHand: null }))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)

    const button = await screen.findByRole("button", { name: "Add stock" })
    expect(button).toBeEnabled()
  })

  it("keeps Receive stock where a count already exists", async () => {
    // Waited for, not read once: the loading state also reads "Receive stock" (deliberately — see
    // below), so a bare findByRole resolves against the disabled placeholder and asserts nothing.
    getVariantStock.mockResolvedValue(stockDetail({ tracked: true, onHand: 12 }))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Receive stock" })).toBeEnabled(),
    )
  })

  it("stays disabled and keeps the tracked label while the stock read is in flight", () => {
    // Defaulting to "Add stock" would flip the wording under the operator's cursor a moment later,
    // and on a tracked product a fast click would open the wrong dialog.
    getVariantStock.mockReturnValue(new Promise(() => {}))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeDisabled()
  })

  it("turns tracking on and records the opening count in ONE request", async () => {
    // One request, not a turn-on followed by an adjust: a failed second call would leave the
    // product tracked at zero — briefly unbuyable — which is the state FR-003 refuses to create by
    // accident.
    const user = userEvent.setup()
    wrap(<StartTrackingDialog variantId="v1" open onOpenChange={() => {}} />)

    expect(screen.getByRole("button", { name: /^add stock$/i })).toBeDisabled()
    await user.type(screen.getByLabelText(/units in stock now/i), "24")
    await user.click(screen.getByRole("button", { name: /^add stock$/i }))

    await waitFor(() => expect(setStockTracking).toHaveBeenCalledTimes(1))
    expect(setStockTracking.mock.calls[0]![1]).toEqual({ tracked: true, onHand: 24 })
    expect(setStockCount).not.toHaveBeenCalled()
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it("says that selling behaviour changes, before the write", async () => {
    // An operator who typed a number into something called "Add stock" has not consented to the
    // product going unbuyable at zero unless it is written next to the field.
    wrap(<StartTrackingDialog variantId="v1" open onOpenChange={() => {}} />)
    expect(screen.getByText(/deducts a unit, and the product stops selling at zero/i)).toBeInTheDocument()
  })

  it("refuses a count that is not a whole number, without asking the server", async () => {
    const user = userEvent.setup()
    wrap(<StartTrackingDialog variantId="v1" open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/units in stock now/i), "-3")
    expect(screen.getByRole("button", { name: /^add stock$/i })).toBeDisabled()
    expect(setStockTracking).not.toHaveBeenCalled()
  })

  it("renders the server's own refusal rather than one generic sentence (053)", async () => {
    const user = userEvent.setup()
    setStockTracking.mockRejectedValue({
      kind: "forbidden",
      status: 403,
      title: "Forbidden",
      detail: "internal wording that must never be rendered",
    })
    wrap(<StartTrackingDialog variantId="v1" open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/units in stock now/i), "5")
    await user.click(screen.getByRole("button", { name: /^add stock$/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/don't have permission/i)
    expect(alert).not.toHaveTextContent(/internal wording/)
  })
})

// The standing rules

describe("inventory rules", () => {
  function openRules(over: Partial<ProductStockDetailDTO["stock"]> = {}, product = PRODUCT) {
    return wrap(
      <InventoryRulesDialog
        detail={product}
        variantId="v1"
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
    // A write that resends untouched fields is how one operator's save silently reverts another's.
    const user = userEvent.setup()
    openRules({ tracked: true, onHand: 12, threshold: null, effectiveThreshold: 8 })

    await user.type(screen.getByLabelText(/low-stock threshold/i), "4")
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setStockThreshold).toHaveBeenCalled())
    expect(setStockThreshold.mock.calls[0]![1]).toEqual({ threshold: 4 })
    expect(setStockTracking).not.toHaveBeenCalled()
  })

  it("clears a threshold back to the shop default rather than making it permanent", async () => {
    const user = userEvent.setup()
    openRules({ tracked: true, onHand: 12, threshold: 4, effectiveThreshold: 4 })

    await user.clear(screen.getByLabelText(/low-stock threshold/i))
    await user.click(screen.getByRole("button", { name: /save rules/i }))

    await waitFor(() => expect(setStockThreshold).toHaveBeenCalled())
    expect(setStockThreshold.mock.calls[0]![1]).toEqual({ threshold: null })
  })

  it("turns tracking on BEFORE writing a threshold that depends on it", async () => {
    // The server refuses a threshold write while tracking is off, so the reverse order turns one
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

// The header chip

const { ProductStatusBadge } = await import("../components/ProductStatusBadge")

describe("the product state chip", () => {
  it("says the shelf is empty rather than that the product is active", async () => {
    // A product whose shelf is empty is `active` in the database and unbuyable in the shop. A chip
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
    // The catalog table carries no per-row count. Degrading is right; inventing one is not.
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

  // The chip may carry a hue, but never as the only carrier: it says its state in words.
  it("never lets colour be the only carrier of the state", () => {
    const cases = [
      { status: "active" as const, stock: stockDetail({ onHand: 0, outOfStock: true }).stock, word: "Out of stock" },
      { status: "active" as const, stock: stockDetail({ onHand: 2, low: true }).stock, word: "Low stock" },
      { status: "draft" as const, stock: undefined, word: "draft" },
      { status: "archived" as const, stock: undefined, word: "archived" },
    ]
    for (const c of cases) {
      const view = wrap(<ProductStatusBadge status={c.status} stock={c.stock} />)
      // The word is present, and it is the chip's own text — not a title attribute a sighted
      // operator cannot see or a screen reader has to hunt for.
      expect(within(view.container).getByText(c.word)).toBeInTheDocument()
    }
  })

  // Empty and low must not look the same. The monochrome version had to collapse them into one
  // "urgent" treatment; conflating them again would cost the operator the distinction that decides
  // whether to reorder today or this week — so the two chips are asserted to differ.
  it("distinguishes an empty shelf from a low one", () => {
    const out = wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />)
    const low = wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 2, low: true }).stock} />)
    const outClass = within(out.container).getByText("Out of stock").className
    const lowClass = within(low.container).getByText("Low stock").className
    expect(outClass).not.toBe(lowClass)
  })
})

// The Activity sheet (057 revision)

describe("the Activity sheet", () => {
  function movement(i: number) {
    return {
      id: `m${i}`,
      quantityDelta: i % 2 === 0 ? -1 : 6,
      quantityBefore: 10,
      quantityAfter: i % 2 === 0 ? 9 : 16,
      reason: i % 2 === 0 ? ("order_paid" as const) : ("received" as const),
      actorKind: i % 2 === 0 ? ("system" as const) : ("shop" as const),
      actorLabel: i % 2 === 0 ? null : "Priya",
      orderNumber: i % 2 === 0 ? `EFY-${i}` : null,
      note: null,
      createdAt: `2026-09-0${(i % 9) + 1}T09:00:00Z`,
    }
  }

  it("shows the WHOLE change log, not the old rail's newest four", async () => {
    // The reason the log moved into a sheet: a rail could only ever fit four entries.
    getVariantStock.mockResolvedValue({
      ...stockDetail(),
      movements: Array.from({ length: 9 }, (_, i) => movement(i)),
    })
    wrap(<ProductActivitySheet
          detail={PRODUCT}
          variantId="v1" open onOpenChange={() => {}} />)

    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(9))
    // Each entry says what moved, then "<when> · <who>".
    expect(within(dialog).getAllByText(/^Sold -1$/)).toHaveLength(5)
    expect(within(dialog).getAllByText(/· Order EFY-/)).toHaveLength(5)
    expect(within(dialog).getAllByText(/· Priya$/)).toHaveLength(4)
  })

  it("does not invent a sales history it has no data for", async () => {
    wrap(<ProductActivitySheet
          detail={PRODUCT}
          variantId="v1" open onOpenChange={() => {}} />)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByText(/last 30 days/i)).not.toBeInTheDocument()
    expect(await within(dialog).findByText(/no changes recorded yet/i)).toBeInTheDocument()
  })
})
