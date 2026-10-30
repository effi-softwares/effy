import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductStockDetailDTO } from "@effy/shared-types"

import { renderList } from "@/test/renderList"

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
}))

const { ReceiveStockButton } = await import("../StockControls")
const { ProductSizes } = await import("../ProductSizes")
const { AdjustStockDialog, ReceiveStockDialog, StartTrackingDialog } = await import("../StockDialogs")
const { InventoryRulesDialog } = await import("../InventoryRulesDialog")

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

/** The Inventory section lists the size's history from the address (103), so it renders inside a router. */
async function wrapRouted(children: ReactNode) {
  const r = renderList(() => children, "/catalog/p1")
  await act(async () => {
    await r.router.load()
  })
  return r
}

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

const SIZED = {
  ...PRODUCT,
  options: [{ id: "o1", position: 1, name: "Size", values: [] }],
  variants: [
    {
      id: "v1",
      state: "active",
      optionValueIds: [null, null],
      shopPriceAmount: "4.00",
      weightGrams: 500,
      label: "500 g",
      code: "V2222222",
      stock: stockDetail({ variantId: "v1", onHand: 12, effectiveThreshold: 5 }).stock,
    },
    {
      id: "v2",
      state: "active",
      optionValueIds: [null, null],
      shopPriceAmount: "4.00",
      weightGrams: 500,
      label: "1 kg",
      code: "V3333333",
      stock: stockDetail({ variantId: "v2", onHand: 0, outOfStock: true }).stock,
    },
    {
      id: "v3",
      state: "active",
      optionValueIds: [null, null],
      shopPriceAmount: "4.00",
      weightGrams: 500,
      label: "5 kg",
      code: "V4444444",
      stock: stockDetail({ variantId: "v3", tracked: false, onHand: null }).stock,
    },
  ],
} as unknown as ProductDetail

describe("each size's stock, one size at a time", () => {
  it("shows the chosen size's count and alert level, and leaves its changes to Stock activity (104)", async () => {
    await wrapRouted(<ProductSizes detail={SIZED} readOnly={false} />)
    expect(await screen.findByText("Alert at 5 or fewer")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "12 on hand" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Stock activity" })).toBeEnabled()
  })

  it("withholds the adjustment when the chosen size is not counted", async () => {
    await wrapRouted(<ProductSizes detail={SIZED} readOnly={false} />)
    await userEvent.click(screen.getByRole("button", { name: /^5 kg/ }))
    expect(await screen.findByText(/not counted, so it never runs out/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^adjust$/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /add stock/i })).toBeEnabled()
  })
})

// Receiving

describe("receiving stock", () => {
  it("adds units with reason 'received' and shows the arithmetic before the write", async () => {
    wrap(<ReceiveStockDialog variantId="v1" stock={stockDetail({ onHand: 12 }).stock} open onOpenChange={() => {}} />)

    await userEvent.type(screen.getByLabelText(/units received/i), "24")
    expect(screen.getByText("12 → 36")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /add to stock/i }))
    await waitFor(() => expect(adjustStock).toHaveBeenCalled())
    expect(adjustStock.mock.calls[0]![1]).toMatchObject({ delta: 24, reason: "received" })
  })

  it("refuses a blank, a fraction and a negative rather than sending them", async () => {
    wrap(<ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />)
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
    wrap(<ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />)
    expect(screen.queryByLabelText(/^supplier$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^reference$/i)).not.toBeInTheDocument()
  })

  it("shows the server's own refusal, not one generic sentence", async () => {
    adjustStock.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Conflict",
      detail: "internal wording that must never be rendered",
    })
    wrap(<ReceiveStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />)
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
    wrap(<AdjustStockDialog variantId="v1" stock={stockDetail({ onHand: 12 }).stock} open onOpenChange={() => {}} />)
    await userEvent.type(screen.getByLabelText(/new count/i), "9")
    await userEvent.click(screen.getByRole("button", { name: /save adjustment/i }))

    await waitFor(() => expect(setStockCount).toHaveBeenCalled())
    expect(setStockCount.mock.calls[0]![1]).toMatchObject({ onHand: 9, reason: "correction" })
    expect(adjustStock).not.toHaveBeenCalled()
  })

  it("writes a signed delta when the operator knows the movement but not the count", async () => {
    const user = userEvent.setup()
    wrap(<AdjustStockDialog variantId="v1" stock={stockDetail({ onHand: 12 }).stock} open onOpenChange={() => {}} />)
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
    wrap(<AdjustStockDialog variantId="v1" stock={stockDetail().stock} open onOpenChange={() => {}} />)
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "0")

    expect(screen.getByRole("button", { name: /save adjustment/i })).toBeDisabled()
  })

  it("previews the server's floor at zero rather than promising a negative shelf", async () => {
    const user = userEvent.setup()
    wrap(<AdjustStockDialog variantId="v1" stock={stockDetail({ onHand: 5 }).stock} open onOpenChange={() => {}} />)
    await user.click(screen.getByLabelText(/^change$/i))
    await user.click(await screen.findByRole("option", { name: /add or remove/i }))
    await user.type(screen.getByLabelText(/change by/i), "-8")
    expect(screen.getByText("5 → 0")).toBeInTheDocument()
  })
})

// Starting a count from the header

describe("the header stock action on an untracked product", () => {
  it("offers Add stock instead of a disabled Receive stock", async () => {
    getVariantStock.mockResolvedValue(stockDetail({ tracked: false, onHand: null }))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)

    const button = await screen.findByRole("button", { name: "Add stock" })
    expect(button).toBeEnabled()
  })

  it("keeps Receive stock where a count already exists", async () => {
    getVariantStock.mockResolvedValue(stockDetail({ tracked: true, onHand: 12 }))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Receive stock" })).toBeEnabled())
  })

  it("stays disabled and keeps the tracked label while the stock read is in flight", () => {
    getVariantStock.mockReturnValue(new Promise(() => {}))
    wrap(<ReceiveStockButton variantId="v1" onReceive={() => {}} />)
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeDisabled()
  })

  it("turns tracking on and records the opening count in ONE request", async () => {
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
    wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />)
    expect(screen.getByText("Out of stock")).toBeInTheDocument()
    expect(screen.queryByText("Live")).not.toBeInTheDocument()
  })

  it("says low stock when it is thin but still on sale", () => {
    wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 2, low: true }).stock} />)
    expect(screen.getByText("Low stock")).toBeInTheDocument()
  })

  it("falls back to the lifecycle label where the count is unknown", () => {
    wrap(<ProductStatusBadge status="active" />)
    expect(screen.getByText("Live")).toBeInTheDocument()
  })

  it("never lets stock relabel a product that is not on sale", () => {
    for (const status of ["draft", "unavailable", "archived"] as const) {
      const view = wrap(
        <ProductStatusBadge status={status} stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />,
      )
      expect(
        within(view.container).getByText({ draft: "Draft", unavailable: "Unavailable", archived: "Archived" }[status]),
      ).toBeInTheDocument()
      expect(within(view.container).queryByText("Out of stock")).not.toBeInTheDocument()
    }
  })

  it("never lets colour be the only carrier of the state", () => {
    const cases = [
      { status: "active" as const, stock: stockDetail({ onHand: 0, outOfStock: true }).stock, word: "Out of stock" },
      { status: "active" as const, stock: stockDetail({ onHand: 2, low: true }).stock, word: "Low stock" },
      { status: "draft" as const, stock: undefined, word: "Draft" },
      { status: "archived" as const, stock: undefined, word: "Archived" },
    ]
    for (const c of cases) {
      const view = wrap(<ProductStatusBadge status={c.status} stock={c.stock} />)
      expect(within(view.container).getByText(c.word)).toBeInTheDocument()
    }
  })

  it("distinguishes an empty shelf from a low one", () => {
    const out = wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 0, outOfStock: true }).stock} />)
    const low = wrap(<ProductStatusBadge status="active" stock={stockDetail({ onHand: 2, low: true }).stock} />)
    const outClass = within(out.container).getByText("Out of stock").className
    const lowClass = within(low.container).getByText("Low stock").className
    expect(outClass).not.toBe(lowClass)
  })
})
