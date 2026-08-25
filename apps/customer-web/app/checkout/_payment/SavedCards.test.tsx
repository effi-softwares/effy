import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PaymentMethodDTO } from "@effy/shared-types"

import { NEW_CARD, SavedCards } from "./SavedCards"

function card(over: Partial<PaymentMethodDTO> = {}): PaymentMethodDTO {
  return {
    id: "pm_1",
    brand: "visa",
    last4: "4242",
    expMonth: 4,
    expYear: 2028,
    isDefault: true,
    usable: true,
    unusableReason: null,
    ...over,
  }
}

describe("SavedCards (051 US3)", () => {
  it("lists each card with enough detail to tell them apart (FR-019)", () => {
    render(
      <SavedCards
        cards={[
          card(),
          card({ id: "pm_2", brand: "mastercard", last4: "8210", expMonth: 11, expYear: 2027, isDefault: false }),
        ]}
        selectedId="pm_1"
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("•••• 4242")).toBeInTheDocument()
    expect(screen.getByText("•••• 8210")).toBeInTheDocument()
    expect(screen.getByText(/expires 04 \/ 28/i)).toBeInTheDocument()
    expect(screen.getByText(/expires 11 \/ 27/i)).toBeInTheDocument()
    expect(screen.getByText(/default/i)).toBeInTheDocument()
  })

  /**
   * ⚠ FR-023, and the half that actually matters is UNSELECTABLE. A card that is merely dimmed still
   * lets a shopper choose it and find out from their bank — which is the worst place to learn it.
   */
  it("shows an unusable card with its reason and refuses to let it be chosen", () => {
    render(
      <SavedCards
        cards={[card({ id: "pm_old", usable: false, unusableReason: "This card has expired." })]}
        selectedId={NEW_CARD}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("This card has expired.")).toBeInTheDocument()
    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    const unusable = radios.find((r) => r.value === "pm_old")
    expect(unusable?.disabled).toBe(true)
  })

  it("always offers a way to use a new card (FR-022)", () => {
    render(
      <SavedCards cards={[card()]} selectedId="pm_1" onSelect={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.getByText(/use a new card/i)).toBeInTheDocument()
  })

  it("lets the shopper switch to a different card", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <SavedCards
        cards={[card(), card({ id: "pm_2", last4: "8210", isDefault: false })]}
        selectedId="pm_1"
        onSelect={onSelect}
        onRemove={vi.fn()}
      />,
    )

    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    await user.click(radios.find((r) => r.value === "pm_2")!)
    expect(onSelect).toHaveBeenCalledWith("pm_2")
  })

  /** FR-024 — removal is reachable from the payment step, not only from the account area. */
  it("offers removal with a label naming the card, and a full-size hit area (FR-033)", () => {
    render(
      <SavedCards cards={[card()]} selectedId="pm_1" onSelect={vi.fn()} onRemove={vi.fn()} />,
    )
    const remove = screen.getByRole("button", { name: /remove card ending 4242/i })
    expect(remove.className).toMatch(/size-11/)
  })

  it("renders nothing at all when the shopper has no kept cards", () => {
    const { container } = render(
      <SavedCards cards={[]} selectedId={NEW_CARD} onSelect={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(container.textContent).toBe("")
  })
})
