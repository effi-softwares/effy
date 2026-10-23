import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PaymentMethodDTO } from "@effy/shared-types"

import { PaymentMethodList } from "./PaymentMethodList"

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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 204 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PaymentMethodList (051 US6)", () => {
  /** "You have no cards" and "we could not ask" are different facts: a failed read must not render as empty. */
  it("says it could not load, rather than claiming there are no cards", () => {
    render(<PaymentMethodList initial={[]} loadFailed />)

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load/i)
    expect(screen.queryByText(/haven't saved any cards/i)).not.toBeInTheDocument()
  })

  /** An honest empty state that explains, with no dead controls. */
  it("explains how cards get here when there are none, and shows no buttons", () => {
    render(<PaymentMethodList initial={[]} />)

    expect(screen.getByText(/haven't saved any cards/i)).toBeInTheDocument()
    expect(screen.getByText(/when you pay/i)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("lists each card with network, last four, expiry and default (FR-024a)", () => {
    render(
      <PaymentMethodList
        initial={[card(), card({ id: "pm_2", last4: "8210", expMonth: 11, expYear: 2027, isDefault: false })]}
      />,
    )

    expect(screen.getByText("•••• 4242")).toBeInTheDocument()
    expect(screen.getByText(/expires 04 \/ 28/i)).toBeInTheDocument()
    expect(screen.getByText("•••• 8210")).toBeInTheDocument()
    expect(screen.getByText(/default/i)).toBeInTheDocument()
  })

  /** An unusable card says why. */
  it("states why an unusable card cannot be used", () => {
    render(
      <PaymentMethodList
        initial={[card({ usable: false, unusableReason: "This card has expired." })]}
      />,
    )
    expect(screen.getByText("This card has expired.")).toBeInTheDocument()
  })

  it("removes a card and drops it from the list", async () => {
    const user = userEvent.setup()
    render(<PaymentMethodList initial={[card(), card({ id: "pm_2", last4: "8210" })]} />)

    await user.click(screen.getByRole("button", { name: /remove card ending 4242/i }))
    await waitFor(() => expect(screen.queryByText("•••• 4242")).not.toBeInTheDocument())
    expect(screen.getByText("•••• 8210")).toBeInTheDocument()
  })

  /** A failed removal keeps the card in the list: it still exists and can still be charged. */
  it("keeps the card when removal fails, and says the cards are unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })))
    const user = userEvent.setup()
    render(<PaymentMethodList initial={[card()]} />)

    await user.click(screen.getByRole("button", { name: /remove card ending 4242/i }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unchanged/i))
    expect(screen.getByText("•••• 4242")).toBeInTheDocument()
  })

  /** A card already gone at the provider is a success from the shopper's point of view. */
  it("treats a 404 as removed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })))
    const user = userEvent.setup()
    render(<PaymentMethodList initial={[card()]} />)

    await user.click(screen.getByRole("button", { name: /remove card ending 4242/i }))
    await waitFor(() => expect(screen.queryByText("•••• 4242")).not.toBeInTheDocument())
  })

  /** The screen never implies Effy holds more of the card than it does. */
  it("says plainly that Effy does not store card numbers", () => {
    render(<PaymentMethodList initial={[card()]} />)
    expect(screen.getByText(/never sees or stores your card number/i)).toBeInTheDocument()
  })
})
