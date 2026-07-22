import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { AddressList } from "./_components/AddressList"

// Dialog mode (desktop) so the form/confirm render synchronously; drawer switching is covered by
// responsive-modal.test.tsx and AddressFormModal.test.tsx.
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

function addr(over: Partial<AddressDTO> = {}): AddressDTO {
  return {
    id: "a1",
    label: "Home",
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
})

describe("AddressList — view (T011)", () => {
  it("lists rows as a list (not cards) and marks exactly one default", () => {
    render(
      <AddressList
        initial={[addr(), addr({ id: "a2", label: "Work", isDefault: false })]}
      />,
    )
    const list = screen.getByRole("list")
    expect(list.tagName).toBe("UL")
    expect(list.className).toContain("divide-y")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getAllByTestId("default-badge")).toHaveLength(1)
    // No shadcn card containers (Principle V — list, not cards).
    expect(document.querySelector('[data-slot="card"]')).toBeNull()
  })

  it("shows an inviting empty state when there are no addresses", () => {
    render(<AddressList initial={[]} />)
    expect(screen.getByTestId("addresses-empty")).toBeInTheDocument()
    expect(screen.getByText(/haven’t saved any addresses/i)).toBeInTheDocument()
  })
})

describe("AddressList — set default (T026)", () => {
  it("sets a non-default as default, leaving exactly one default", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(addr({ id: "a2", label: "Work", isDefault: true }))),
    )
    render(
      <AddressList
        initial={[addr(), addr({ id: "a2", label: "Work", isDefault: false })]}
      />,
    )

    await user.click(screen.getByRole("button", { name: /set as default/i }))
    await waitFor(() => expect(screen.getAllByTestId("default-badge")).toHaveLength(1))
    // The default badge now lives on the Work row.
    const workRow = screen.getByText("Work").closest("li")!
    expect(within(workRow).getByTestId("default-badge")).toBeInTheDocument()
  })

  it("offers no set-default control on the already-default row (idempotent — FR-014)", () => {
    render(<AddressList initial={[addr(), addr({ id: "a2", isDefault: false, label: "Work" })]} />)
    const homeRow = screen.getByText("Home").closest("li")!
    expect(within(homeRow).queryByRole("button", { name: /set as default/i })).toBeNull()
  })
})

describe("AddressList — delete (T030)", () => {
  it("confirms then removes a non-default row", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(null, true, 204)))
    render(<AddressList initial={[addr(), addr({ id: "a2", isDefault: false, label: "Work" })]} />)

    const workRow = screen.getByText("Work").closest("li")!
    await user.click(within(workRow).getByRole("button", { name: /delete/i }))
    await user.click(await screen.findByRole("button", { name: /^delete$/i }))

    await waitFor(() => expect(screen.queryByText("Work")).toBeNull())
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("blocks deleting the default while others exist, prompting to reassign", async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn(async () => jsonRes(null, true, 204))
    vi.stubGlobal("fetch", fetchSpy)
    render(<AddressList initial={[addr(), addr({ id: "a2", isDefault: false, label: "Work" })]} />)

    const homeRow = screen.getByText("Home").closest("li")!
    await user.click(within(homeRow).getByRole("button", { name: /delete/i }))

    expect(await screen.findByText(/set another default first/i)).toBeInTheDocument()
    // No destructive delete action offered, and nothing was sent to the server.
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("maps a server 409 (race) to the same reassign prompt", async () => {
    const user = userEvent.setup()
    // A non-default row the client would allow, but the server 409s (it became default in a race).
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: "set another default first" }, false, 409)))
    render(<AddressList initial={[addr(), addr({ id: "a2", isDefault: false, label: "Work" })]} />)

    const workRow = screen.getByText("Work").closest("li")!
    await user.click(within(workRow).getByRole("button", { name: /delete/i }))
    await user.click(await screen.findByRole("button", { name: /^delete$/i }))

    expect(await screen.findByText(/set another default first/i)).toBeInTheDocument()
  })

  it("allows deleting the sole address (default) → empty state", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(null, true, 204)))
    render(<AddressList initial={[addr()]} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))
    await user.click(await screen.findByRole("button", { name: /^delete$/i }))

    await waitFor(() => expect(screen.getByTestId("addresses-empty")).toBeInTheDocument())
  })
})

describe("AddressList — edit entry point (T033)", () => {
  it("opens the pre-filled edit form from the row body", async () => {
    const user = userEvent.setup()
    render(<AddressList initial={[addr({ recipientName: "Pat", label: "Home" })]} />)

    await user.click(screen.getByTestId("address-row-body"))
    expect(await screen.findByText("Edit address")).toBeInTheDocument()
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Pat")
  })

  it("does NOT open the editor from the set-default or delete controls (FR-017a)", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(addr({ id: "a2", isDefault: true, label: "Work" }))))
    render(<AddressList initial={[addr(), addr({ id: "a2", isDefault: false, label: "Work" })]} />)

    await user.click(within(screen.getByText("Work").closest("li")!).getByRole("button", { name: /set as default/i }))
    expect(screen.queryByText("Edit address")).toBeNull()

    await user.click(within(screen.getByText("Work").closest("li")!).getByRole("button", { name: /delete/i }))
    expect(screen.queryByText("Edit address")).toBeNull()
  })
})
