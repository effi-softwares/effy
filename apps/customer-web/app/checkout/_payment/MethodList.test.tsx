import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MethodList } from "./MethodList"

vi.mock("@stripe/react-stripe-js", () => ({
  PaymentElement: () => <div data-testid="payment-element" />,
}))

describe("MethodList (051 US4)", () => {
  /**
   * ⚠ FR-010/FR-011 — the requirement this whole boolean exists for. An option that cannot be
   * completed must be ABSENT, not present-and-empty: an empty "Pay over time" row is the
   * unexplained-disappearance failure wearing a different hat.
   */
  it("omits pay over time entirely when the provider offers none", () => {
    render(
      <MethodList selected="card" onSelect={vi.fn()} laterAvailable={false}>
        <div>card fields</div>
      </MethodList>,
    )
    expect(screen.queryByText(/pay over time/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/instalment/i)).not.toBeInTheDocument()
  })

  it("offers pay over time when the provider does", () => {
    render(
      <MethodList selected="card" onSelect={vi.fn()} laterAvailable>
        <div>card fields</div>
      </MethodList>,
    )
    expect(screen.getByText(/pay over time/i)).toBeInTheDocument()
  })

  /**
   * ⚠ THE CORRECTNESS ASSERTION, not a layout one. A Payment Element and split card elements mounted
   * together make `confirmPayment({elements})` ambiguous — it collects from everything mounted, so an
   * untouched card form would fail validation while the shopper pays with Klarna. These two tests are
   * what keep them mutually exclusive.
   */
  it("mounts only the card fields while card is selected", () => {
    render(
      <MethodList selected="card" onSelect={vi.fn()} laterAvailable>
        <div data-testid="card-fields">card fields</div>
      </MethodList>,
    )
    expect(screen.getByTestId("card-fields")).toBeInTheDocument()
    expect(screen.queryByTestId("payment-element")).not.toBeInTheDocument()
  })

  it("mounts only the payment element while pay over time is selected", () => {
    render(
      <MethodList selected="later" onSelect={vi.fn()} laterAvailable>
        <div data-testid="card-fields">card fields</div>
      </MethodList>,
    )
    expect(screen.getByTestId("payment-element")).toBeInTheDocument()
    expect(screen.queryByTestId("card-fields")).not.toBeInTheDocument()
  })

  it("lets the shopper switch between families", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <MethodList selected="card" onSelect={onSelect} laterAvailable>
        <div>card fields</div>
      </MethodList>,
    )
    await user.click(screen.getByRole("button", { name: /pay over time/i }))
    expect(onSelect).toHaveBeenCalledWith("later")
  })

  /** FR-035 — rows in a list, not a card layout; selection reads as a border, not a fill. */
  it("marks the selected row without a filled container", () => {
    const { container } = render(
      <MethodList selected="card" onSelect={vi.fn()} laterAvailable>
        <div>card fields</div>
      </MethodList>,
    )
    const rows = container.querySelectorAll("[class*='rounded-[14px]']")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.className).toMatch(/border-foreground/)
    expect(rows[0]!.className).not.toMatch(/bg-(primary|foreground)\b/)
  })
})
