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
