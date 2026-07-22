import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { AddressPicker } from "./AddressPicker"

// The add-new form mounts a ResponsiveModal (Dialog above the breakpoint); pin it to Dialog and stub
// the address-book's telemetry so no posthog call fires.
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

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  mockIsMobile.value = false
})

describe("AddressPicker — selection (T009)", () => {
  it("shows the pre-selected address as a summary, not a radio list", () => {
    render(
      <AddressPicker
        addresses={[addr()]}
        selectedId="a1"
        onSelect={() => {}}
        onAddressAdded={() => {}}
        idPrefix="shipping"
      />,
    )
    expect(screen.getByText("Pat")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument()
    // Collapsed: no radio group is rendered.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })

  it("prompts to add one when the book is empty (blocks pay via the parent, FR-007)", () => {
    render(
      <AddressPicker
        addresses={[]}
        selectedId={null}
        onSelect={() => {}}
        onAddressAdded={() => {}}
        idPrefix="shipping"
      />,
    )
    expect(screen.getByTestId("shipping-empty")).toHaveTextContent(/add an address to continue/i)
    expect(screen.getByRole("button", { name: /add an address/i })).toBeInTheDocument()
  })

  it("Change reveals the saved list with the default badged; picking a radio calls onSelect", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <AddressPicker
        addresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
        selectedId="a1"
        onSelect={onSelect}
        onAddressAdded={() => {}}
        idPrefix="shipping"
      />,
    )

    await user.click(screen.getByRole("button", { name: /change/i }))
    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByText("Default")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: /Sam/ }))
    expect(onSelect).toHaveBeenCalledWith("a2")
  })
})

describe("AddressPicker — add new (T018)", () => {
  it("opens the responsive form and hands the created address to onAddressAdded (not onSelect)", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onAddressAdded = vi.fn()
    const created = addr({ id: "new1", recipientName: "New Person", isDefault: false })
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(created)))

    render(
      <AddressPicker
        addresses={[addr()]}
        selectedId="a1"
        onSelect={onSelect}
        onAddressAdded={onAddressAdded}
        idPrefix="shipping"
      />,
    )

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("button", { name: /add a new address/i }))

    await user.type(screen.getByLabelText("Recipient name"), "New Person")
    await user.type(screen.getByLabelText("Address line 1"), "9 New Rd")
    await user.type(screen.getByLabelText("City"), "Sydney")
    await user.type(screen.getByLabelText("Postcode"), "2000")
    await user.click(screen.getByRole("button", { name: /save address/i }))

    await waitFor(() => expect(onAddressAdded).toHaveBeenCalledWith(created))
    // The parent owns selection — the picker does not also fire onSelect for an add.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("keeps input and saves nothing on an invalid submit", async () => {
    const user = userEvent.setup()
    const onAddressAdded = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    render(
      <AddressPicker
        addresses={[addr()]}
        selectedId="a1"
        onSelect={() => {}}
        onAddressAdded={onAddressAdded}
        idPrefix="shipping"
      />,
    )

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("button", { name: /add a new address/i }))
    await user.type(screen.getByLabelText("Recipient name"), "Half")
    await user.click(screen.getByRole("button", { name: /save address/i }))

    expect(await screen.findByText(/address line 1 is required/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onAddressAdded).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Half")
  })

  it("saves nothing when the add form is dismissed", async () => {
    const user = userEvent.setup()
    const onAddressAdded = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    render(
      <AddressPicker
        addresses={[addr()]}
        selectedId="a1"
        onSelect={() => {}}
        onAddressAdded={onAddressAdded}
        idPrefix="shipping"
      />,
    )

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("button", { name: /add a new address/i }))
    await user.type(screen.getByLabelText("Recipient name"), "Nope")
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(onAddressAdded).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
