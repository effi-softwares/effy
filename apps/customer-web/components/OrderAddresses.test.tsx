import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrderAddressDTO } from "@effy/shared-types"

import { OrderAddresses } from "./OrderAddresses"

function orderAddr(over: Partial<OrderAddressDTO> = {}): OrderAddressDTO {
  return {
    recipientName: "Pat",
    phone: null,
    line1: "1 Test St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postalCode: "3000",
    country: "AU",
    ...over,
  }
}

describe("OrderAddresses (US5, FR-016)", () => {
  it("shows shipping in full and 'Same as shipping' when billing is null", () => {
    render(<OrderAddresses shipping={orderAddr()} billing={null} />)
    expect(screen.getByText("Delivering to")).toBeInTheDocument()
    expect(screen.getByText(/Pat/)).toBeInTheDocument()
    expect(screen.getByText("Billing address")).toBeInTheDocument()
    expect(screen.getByText(/same as shipping/i)).toBeInTheDocument()
  })

  it("treats an absent billing field the same as null (pre-023 orders)", () => {
    render(<OrderAddresses shipping={orderAddr()} />)
    expect(screen.getByText(/same as shipping/i)).toBeInTheDocument()
  })

  it("shows both addresses in full when billing diverges", () => {
    render(
      <OrderAddresses
        shipping={orderAddr({ recipientName: "Pat", line1: "1 Ship St" })}
        billing={orderAddr({ recipientName: "Company Ltd", line1: "500 Bill Rd", city: "Sydney", postalCode: "2000" })}
      />,
    )
    expect(screen.getByText(/Pat/)).toBeInTheDocument()
    expect(screen.getByText(/1 Ship St/)).toBeInTheDocument()
    expect(screen.getByText(/Company Ltd/)).toBeInTheDocument()
    expect(screen.getByText(/500 Bill Rd/)).toBeInTheDocument()
    expect(screen.queryByText(/same as shipping/i)).not.toBeInTheDocument()
  })
})

// ── 066 — delivery instructions ─────────────────────────────────────────────────────────────────

describe("066 — delivery instructions on the receipt", () => {
  const shipping = {
    recipientName: "Pat", phone: null, line1: "1 Test St", line2: null,
    city: "Carlton", region: "VIC", postalCode: "3053", country: "AU",
  }

  it("shows the preference in words and the note as typed", () => {
    render(
      <OrderAddresses
        shipping={shipping}
        instructions={{ handover: "leave_at_door", note: "Side gate\ncode 4411" }}
      />,
    )
    expect(screen.getByRole("heading", { name: "Delivery instructions" })).toBeInTheDocument()
    expect(screen.getByText("Leave at the door")).toBeInTheDocument()
    expect(screen.getByText(/Side gate/)).toHaveTextContent("Side gate code 4411")
  })

  /** SC-003 — every order placed before 066, and every order whose shopper said nothing. */
  it("⚠ shows NOTHING when there are none — no heading, no placeholder", () => {
    for (const instructions of [undefined, null, { handover: null, note: null }]) {
      const { unmount } = render(<OrderAddresses shipping={shipping} instructions={instructions} />)
      expect(screen.queryByRole("heading", { name: "Delivery instructions" })).toBeNull()
      expect(screen.queryByText(/none|no instructions/i)).toBeNull()
      unmount()
    }
  })

  /** ⚠ SC-006 — customer-authored text is never interpreted. */
  it("⚠ renders markup in the note as the literal characters typed", () => {
    const hostile =
      '<b>bold</b> <a href="javascript:alert(1)">link</a> <img src=x onerror=alert(1)> <script>alert(1)</script>'
    const { container } = render(
      <OrderAddresses shipping={shipping} instructions={{ handover: null, note: hostile }} />,
    )
    expect(screen.getByText(hostile)).toBeInTheDocument()
    expect(container.querySelector("b, a, img, script")).toBeNull()
  })
})
