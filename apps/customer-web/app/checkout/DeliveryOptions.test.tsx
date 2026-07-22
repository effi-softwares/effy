import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { QuotePackageDTO } from "@effy/shared-types"

import { DeliveryOptions, defaultMethodFor } from "./DeliveryOptions"

const sameDay = { method: "same_day" as const, serviceLevel: "Same-day", feeAmount: "7.00", window: "Today by 6pm", scheduleDates: null }
const standard = { method: "standard" as const, serviceLevel: "Standard", feeAmount: "5.00", window: "in 2–3 days", scheduleDates: null }
const scheduled = { method: "scheduled" as const, serviceLevel: "Pick a date", feeAmount: "6.00", window: null, scheduleDates: ["2026-07-24", "2026-07-25"] }

const metro: QuotePackageDTO = {
  packageKey: "pkg_a1b2",
  items: [{ productId: "p1", name: "Sourdough loaf", quantity: 2, imageUrl: null }],
  serviceable: true,
  methods: [sameDay, standard, scheduled],
}
const regional: QuotePackageDTO = {
  packageKey: "pkg_c3d4",
  items: [{ productId: "p2", name: "Dish soap", quantity: 1, imageUrl: null }],
  serviceable: true,
  methods: [standard],
}
const undeliverable: QuotePackageDTO = {
  packageKey: "pkg_e5f6",
  items: [{ productId: "p3", name: "Frozen peas", quantity: 1, imageUrl: null }],
  serviceable: false,
  methods: [],
}

function renderOptions(packages: QuotePackageDTO[], onConfirm = vi.fn()) {
  render(
    <DeliveryOptions
      packages={packages}
      itemSubtotal="20.00"
      currency="AUD"
      busy={false}
      onConfirm={onConfirm}
      onBack={vi.fn()}
    />,
  )
  return onConfirm
}

describe("defaultMethodFor", () => {
  it("picks same-day when the preference is fastest", () => {
    expect(defaultMethodFor(metro, "fastest")?.method).toBe("same_day")
  })
  it("picks the cheapest fee when the preference is cheapest", () => {
    expect(defaultMethodFor(metro, "cheapest")?.method).toBe("standard")
  })
})

describe("DeliveryOptions — anonymous packages (SC-006)", () => {
  it("labels packages positionally and reveals no shop identity", () => {
    renderOptions([metro, regional])
    expect(screen.getByText("Package 1")).toBeInTheDocument()
    expect(screen.getByText("Package 2")).toBeInTheDocument()
    expect(screen.getByText("Sourdough loaf × 2")).toBeInTheDocument()
    expect(screen.getByText("Dish soap")).toBeInTheDocument()
    // Nothing anywhere names or locates a shop.
    expect(screen.queryByText(/shop/i)).toBeNull()
  })
})

describe("DeliveryOptions — running total re-sums on override (SC-011b)", () => {
  it("defaults to fastest and re-sums when a package is overridden", async () => {
    const user = userEvent.setup()
    renderOptions([metro])
    // Fastest → same-day $7 + items $20 = $27 (unique to the total row).
    expect(screen.getByText("$27.00")).toBeInTheDocument()

    // Override this package to Standard ($5) → total becomes $25.
    await user.click(screen.getByRole("radio", { name: /Standard/ }))
    expect(screen.getByText("$25.00")).toBeInTheDocument()
    expect(screen.queryByText("$27.00")).toBeNull()
  })
})

describe("DeliveryOptions — set-aside + explicit confirm (US2 / SC-011a)", () => {
  it("blocks confirm until the customer proceeds without the set-aside items", async () => {
    const user = userEvent.setup()
    const onConfirm = renderOptions([metro, undeliverable])

    // The undeliverable items are named (never a shop) with a set-aside notice.
    expect(screen.getByText("Frozen peas")).toBeInTheDocument()
    expect(screen.getByText(/can’t deliver these items/i)).toBeInTheDocument()

    const confirm = screen.getByRole("button", { name: /Continue to payment/ })
    expect(confirm).toBeDisabled()

    await user.click(screen.getByRole("checkbox", { name: /Proceed without these items/ }))
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [selections, excluded] = onConfirm.mock.calls[0]
    // Only the deliverable package is selected; the undeliverable one is excluded — no fee sent.
    expect(selections).toEqual([{ packageKey: "pkg_a1b2", method: "same_day", scheduledDate: null }])
    expect(excluded).toEqual(["pkg_e5f6"])
    expect(JSON.stringify(selections)).not.toContain("fee")
  })

  it("blocks entirely when every package is undeliverable (FR-006c)", () => {
    renderOptions([undeliverable])
    expect(screen.getByText(/Nothing in your cart can be delivered here/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Continue to payment/ })).toBeNull()
  })
})
