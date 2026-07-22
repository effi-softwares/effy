import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { AddressFormModal } from "./_components/AddressFormModal"

const { mockIsMobile } = vi.hoisted(() => ({ mockIsMobile: { value: false } }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => mockIsMobile.value }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

function created(over: Partial<AddressDTO> = {}): AddressDTO {
  return {
    id: "new1",
    label: null,
    recipientName: "Pat",
    phone: null,
    line1: "1 Test St",
    line2: null,
    city: "Melbourne",
    region: null,
    postalCode: "3000",
    country: "AU",
    isDefault: true,
    ...over,
  }
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

/** Fill the four required fields. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recipient name"), "Pat")
  await user.type(screen.getByLabelText("Address line 1"), "1 Test St")
  await user.type(screen.getByLabelText("City"), "Melbourne")
  await user.type(screen.getByLabelText("Postcode"), "3000")
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  mockIsMobile.value = false
})

describe("AddressFormModal — responsive container (T020, SC-006)", () => {
  it("mounts in a Dialog at/above the breakpoint", () => {
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={() => {}} />)
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument()
  })

  it("mounts in a Drawer below the breakpoint", () => {
    mockIsMobile.value = true
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={() => {}} />)
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument()
  })
})

describe("AddressFormModal — add (T020)", () => {
  it("saves a valid address and reports it (server auto-default reflected)", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn(async () => jsonRes(created()))
    vi.stubGlobal("fetch", fetchSpy)
    const onSaved = vi.fn()
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={onSaved} />)

    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: /save address/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toMatchObject({ isDefault: true })
    expect(fetchSpy).toHaveBeenCalledWith("/api/addresses", expect.objectContaining({ method: "POST" }))
  })

  it("shows field errors on an invalid submit and preserves entered input", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={() => {}} />)

    // Only recipient filled; the rest are missing.
    await user.type(screen.getByLabelText("Recipient name"), "Pat")
    await user.click(screen.getByRole("button", { name: /save address/i }))

    expect(await screen.findByText(/address line 1 is required/i)).toBeInTheDocument()
    expect(screen.getByText(/city is required/i)).toBeInTheDocument()
    expect(screen.getByText(/postcode is required/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    // Input preserved.
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Pat")
  })

  it("writes the selected label chip to the wire label", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes(created({ label: "Work" })))
    vi.stubGlobal("fetch", fetchSpy)
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Work" }))
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: /save address/i }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.label).toBe("Work")
  })

  it("reveals a free-text field for Other and stores its value as the label", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes(created({ label: "Beach house" })))
    vi.stubGlobal("fetch", fetchSpy)
    render(<AddressFormModal open onOpenChange={() => {}} onSaved={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Other" }))
    await user.type(screen.getByLabelText("Custom label"), "Beach house")
    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: /save address/i }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.label).toBe("Beach house")
  })

  it("saves nothing when dismissed mid-entry (SC-009)", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const onOpenChange = vi.fn()
    render(<AddressFormModal open onOpenChange={onOpenChange} onSaved={() => {}} />)

    await user.type(screen.getByLabelText("Recipient name"), "Pat")
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("AddressFormModal — edit (T033)", () => {
  it("pre-fills from the address and re-selects the stored chip", () => {
    render(
      <AddressFormModal
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        address={created({ id: "a1", label: "Work", recipientName: "Sam", isDefault: false })}
      />,
    )
    expect(screen.getByText("Edit address")).toBeInTheDocument()
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Sam")
    expect(screen.getByRole("button", { name: "Work" })).toHaveAttribute("aria-pressed", "true")
  })

  it("re-selects Other with the free text for a custom stored label", () => {
    render(
      <AddressFormModal
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        address={created({ id: "a1", label: "Beach house" })}
      />,
    )
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("Custom label")).toHaveValue("Beach house")
  })
})
