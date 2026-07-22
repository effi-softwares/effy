import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { BillingSection } from "./BillingSection"

const { mockIsMobile } = vi.hoisted(() => ({ mockIsMobile: { value: false } }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => mockIsMobile.value }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

function addr(over: Partial<AddressDTO> = {}): AddressDTO {
  return {
    id: "a1",
    label: null,
    recipientName: "Pat",
    phone: null,
    line1: "1 Test St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postalCode: "3000",
    country: "AU",
    isDefault: true,
    ...over,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  mockIsMobile.value = false
})

describe("BillingSection (T022)", () => {
  it("is ON by default and hides the billing picker", () => {
    render(
      <BillingSection
        sameAsShipping
        onSameAsShippingChange={() => {}}
        addresses={[addr()]}
        billingId={null}
        onBillingSelect={() => {}}
        onAddressAdded={() => {}}
      />,
    )
    expect(screen.getByRole("switch")).toBeChecked()
    // No billing picker while same-as-shipping.
    expect(screen.queryByText("Billing address")).not.toBeInTheDocument()
  })

  it("toggling the switch calls onSameAsShippingChange(false)", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <BillingSection
        sameAsShipping
        onSameAsShippingChange={onChange}
        addresses={[addr()]}
        billingId={null}
        onBillingSelect={() => {}}
        onAddressAdded={() => {}}
      />,
    )
    await user.click(screen.getByRole("switch"))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it("OFF with no billing chosen reveals the picker and a choose-a-billing prompt (FR-012)", () => {
    render(
      <BillingSection
        sameAsShipping={false}
        onSameAsShippingChange={() => {}}
        addresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
        billingId={null}
        onBillingSelect={() => {}}
        onAddressAdded={() => {}}
      />,
    )
    expect(screen.getByRole("switch")).not.toBeChecked()
    expect(screen.getByText(/choose a billing address to continue/i)).toBeInTheDocument()
    // The picker auto-expands (no billing selected yet) → the saved list is visible.
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0)
  })
})
