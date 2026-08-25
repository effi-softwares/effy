import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { WalletRow } from "./WalletRow"

/**
 * The Express Checkout Element is a provider iframe; this stands it in so the SHELL — which is the
 * part Effy owns and controls — can be asserted. `onReady` is invoked with whatever the test wants the
 * device to report.
 */
let readyPayload: { availablePaymentMethods?: Record<string, boolean> } = {}
vi.mock("@stripe/react-stripe-js", () => ({
  ExpressCheckoutElement: ({ onReady }: { onReady: (e: unknown) => void }) => {
    onReady(readyPayload)
    return <div data-testid="express-element" />
  },
}))

describe("WalletRow (051 US2)", () => {
  /**
   * ⚠ US2 scenario 2, and the one that actually bites. A shopper in a browser with no wallet must see
   * no heading, no gap and no apology — just the card form. The failure mode this guards is an
   * orphaned "One tap" caption floating above empty space, which looks like the page is broken.
   */
  it("renders nothing at all when the device has no wallet", () => {
    readyPayload = {} // no availablePaymentMethods → nothing available
    const onRendered = vi.fn()
    const { container } = render(
      <WalletRow onConfirm={vi.fn()} onError={vi.fn()} onRendered={onRendered} />,
    )

    expect(screen.queryByText(/one tap/i)).not.toBeInTheDocument()
    expect(container.textContent).toBe("")
    expect(onRendered).toHaveBeenCalledWith(false)
  })

  it("shows the row and its caption when a wallet is available", () => {
    readyPayload = { availablePaymentMethods: { applePay: true } }
    const onRendered = vi.fn()
    render(<WalletRow onConfirm={vi.fn()} onError={vi.fn()} onRendered={onRendered} />)

    expect(screen.getByTestId("express-element")).toBeInTheDocument()
    expect(screen.getByText(/one tap/i)).toBeInTheDocument()
    expect(onRendered).toHaveBeenCalledWith(true)
  })

  /**
   * ⚠ The page needs to know, because the "or pay another way" rule is only meaningful with something
   * above it. A divider dividing one thing is worse than no divider.
   */
  it("tells the page whether anything rendered", () => {
    readyPayload = { availablePaymentMethods: { link: true } }
    const onRendered = vi.fn()
    render(<WalletRow onConfirm={vi.fn()} onError={vi.fn()} onRendered={onRendered} />)
    expect(onRendered).toHaveBeenCalledWith(true)
  })
})
