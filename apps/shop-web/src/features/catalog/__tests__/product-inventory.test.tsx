import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductStockDetailDTO } from "@effy/shared-types"

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

const { InventorySection, ReceiveStockButton } = await import("../InventorySection")
const { AdjustStockDialog, ReceiveStockDialog, StartTrackingDialog } = await import("../StockDialogs")
const { InventoryRulesDialog } = await import("../InventoryRulesDialog")
const { ProductActivitySheet } = await import("../ProductActivitySheet")

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
  getProductStock.mockResolvedValue(stockDetail())
  setStockCount.mockResolvedValue(stockDetail())
  adjustStock.mockResolvedValue(stockDetail())
  setStockTracking.mockResolvedValue(stockDetail())
  setStockThreshold.mockResolvedValue(stockDetail())
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

  // ⚠ REWRITTEN BY THE THEME ADOPTION, NOT DELETED. This used to forbid a hue outright, because the
  // monochrome constitution had no colour meaning "running low". It now pins the two things that
  // still matter: the sentence says which state it is (so the line survives greyscale and a screen
  // reader), and EMPTY and LOW do not render alike — collapsing them is what made "nothing left" and
  // "a few left" look like the same problem.
  it("says an empty shelf is unbuyable, in words AND distinguishably from merely low", async () => {
    getProductStock.mockResolvedValue(stockDetail({ onHand: 0, outOfStock: true }))
    const out = wrap(<InventorySection detail={PRODUCT} />)
    const outLine = await within(out.container).findByText(
      /out of stock — shoppers cannot buy this right now/i,
    )
    expect(outLine.className).toMatch(/font-semibold/)

    getProductStock.mockResolvedValue(stockDetail({ onHand: 2, low: true }))
    const low = wrap(<InventorySection detail={PRODUCT} />)
    const lowLine = await within(low.container).findByText(/running low — 2 left/i)
    expect(lowLine.className).toMatch(/font-semibold/)

    expect(outLine.className).not.toBe(lowLine.className)
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

  it("does not imitate purchasing with free-text supplier and reference boxes", async () => {
    // ⚠ The mockup's receive sheet has Supplier and Reference boxes. Where stock came from belongs to
    // purchasing (deferred to its own feature); two free-text boxes here would record that intent as
    // unjoinable prose while leaving the operator believing the delivery had been reconciled.
    wrap(
      <ReceiveStockDialog productId="p1" stock={stockDetail().stock} open onOpenChange={() => {}} />,
    )
    expect(screen.queryByLabelText(/^supplier$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^reference$/i)).not.toBeInTheDocument()
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

// ── Starting a count from the header ─────────────────────────────────────────────────────────────

describe("the header stock action on an untracked product", () => {
  // ⚠ TRACKING IS OFF BY DEFAULT (054), so this is the state MOST products are in — the header's
  // stock button used to be dead on nearly every product page, with its only explanation in a `title`
  // attribute no touch device shows. These assertions pin the replacement: the label says which
  // action is coming, and the action itself is reachable in one step.

  it("offers Add stock instead of a disabled Receive stock", async () => {
    getProductStock.mockResolvedValue(stockDetail({ tracked: false, onHand: null }))
    wrap(<ReceiveStockButton detail={PRODUCT} onReceive={() => {}} />)

    const button = await screen.findByRole("button", { name: "Add stock" })
    expect(button).toBeEnabled()
  })

  it("keeps Receive stock where a count already exists", async () => {
    // ⚠ Waited for, not read once: the loading state ALSO reads "Receive stock" (deliberately — see
    // below), so a bare findByRole resolves against the disabled placeholder and asserts nothing.
    getProductStock.mockResolvedValue(stockDetail({ tracked: true, onHand: 12 }))
    wrap(<ReceiveStockButton detail={PRODUCT} onReceive={() => {}} />)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Receive stock" })).toBeEnabled(),
    )
  })

  it("stays disabled and keeps the tracked label while the stock read is in flight", () => {
    // ⚠ Defaulting to "Add stock" would flip the wording under the operator's cursor a moment later,
    // and on a tracked product a fast click would open the wrong dialog.
    getProductStock.mockReturnValue(new Promise(() => {}))
    wrap(<ReceiveStockButton detail={PRODUCT} onReceive={() => {}} />)
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeDisabled()
  })

  it("turns tracking on and records the opening count in ONE request", async () => {
    // ⚠ One request, not a turn-on followed by an adjust: a failed second call would leave the
    // product tracked at zero — briefly unbuyable — which is the state FR-003 refuses to create by
    // accident.
    const user = userEvent.setup()
    wrap(<StartTrackingDialog productId="p1" open onOpenChange={() => {}} />)

    expect(screen.getByRole("button", { name: /^add stock$/i })).toBeDisabled()
    await user.type(screen.getByLabelText(/units in stock now/i), "24")
    await user.click(screen.getByRole("button", { name: /^add stock$/i }))

    await waitFor(() => expect(setStockTracking).toHaveBeenCalledTimes(1))
    expect(setStockTracking.mock.calls[0]![1]).toEqual({ tracked: true, onHand: 24 })
    expect(setStockCount).not.toHaveBeenCalled()
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it("says that selling behaviour changes, before the write", async () => {
    // ⚠ An operator who typed a number into something called "Add stock" has not consented to the
    // product going unbuyable at zero unless it is written next to the field.
    wrap(<StartTrackingDialog productId="p1" open onOpenChange={() => {}} />)
    expect(screen.getByText(/deducts a unit, and the product stops selling at zero/i)).toBeInTheDocument()
  })

  it("refuses a count that is not a whole number, without asking the server", async () => {
    const user = userEvent.setup()
    wrap(<StartTrackingDialog productId="p1" open onOpenChange={() => {}} />)

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
    wrap(<StartTrackingDialog productId="p1" open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/units in stock now/i), "5")
    await user.click(screen.getByRole("button", { name: /^add stock$/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/don't have permission/i)
    expect(alert).not.toHaveTextContent(/internal wording/)
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

  // ⚠ THIS TEST WAS REVERSED BY THE THEME ADOPTION, AND REWRITTEN RATHER THAN DELETED. It used to
  // assert the chip carried NO hue at all, which was the monochrome constitution (041): amber was
  // banned and `--success` was a 4.00:1 non-text indicator. The adopted theme supplies `--warning`
  // and re-tunes `--success` to clear 4.5:1 on its own tint, so a hue is now correct here.
  //
  // What survived the reversal is the requirement that actually protects anyone: THE COLOUR IS NEVER
  // THE ONLY CARRIER. A chip must still say its state in words, so it reads identically to a
  // colour-blind operator, in greyscale, and to a screen reader. Deleting this test because its
  // premise changed would have taken that guarantee with it.
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

  // ⚠ EMPTY AND LOW MUST NOT LOOK THE SAME. The monochrome version had to collapse them into one
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

// ── The Activity sheet (057 revision) ────────────────────────────────────────────────────────────

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
    // ⚠ The reason the log moved into a sheet: a rail could only ever fit four entries.
    getProductStock.mockResolvedValue({
      ...stockDetail(),
      movements: Array.from({ length: 9 }, (_, i) => movement(i)),
    })
    wrap(<ProductActivitySheet detail={PRODUCT} open onOpenChange={() => {}} />)

    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(9))
    // Each entry says what moved, then "<when> · <who>".
    expect(within(dialog).getAllByText(/^Sold -1$/)).toHaveLength(5)
    expect(within(dialog).getAllByText(/· Order EFY-/)).toHaveLength(5)
    expect(within(dialog).getAllByText(/· Priya$/)).toHaveLength(4)
  })

  it("does not invent a sales history it has no data for", async () => {
    wrap(<ProductActivitySheet detail={PRODUCT} open onOpenChange={() => {}} />)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByText(/last 30 days/i)).not.toBeInTheDocument()
    expect(await within(dialog).findByText(/no changes recorded yet/i)).toBeInTheDocument()
  })
})
