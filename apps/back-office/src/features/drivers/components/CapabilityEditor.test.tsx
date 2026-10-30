import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DriverCapability } from "@effy/shared-types"

const listCapabilities = vi.hoisted(() => vi.fn())
const grantCapability = vi.hoisted(() => vi.fn())
const revokeCapability = vi.hoisted(() => vi.fn())
const listZones = vi.hoisted(() => vi.fn())
const roles = vi.hoisted(() => ({ current: [] as string[] }))

vi.mock("../capabilityRepo", () => ({
  listCapabilities,
  grantCapability,
  revokeCapability,
  getCoverage: vi.fn(),
}))
vi.mock("../repo", () => ({ listZones }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { CapabilityEditor } = await import("./CapabilityEditor")

function cap(over: Partial<DriverCapability> = {}): DriverCapability {
  return {
    id: "c-1",
    function: "delivery",
    zoneId: "z-1",
    zoneName: "Inner North",
    grantedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  }
}

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<CapabilityEditor driverId="d-1" />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  roles.current = ["admin"]
  listCapabilities.mockResolvedValue({ items: [cap()] })
  listZones.mockResolvedValue([{ id: "z-1", name: "Inner North" }])
  grantCapability.mockResolvedValue({ items: [cap()] })
  revokeCapability.mockResolvedValue({ items: [] })
})

describe("CapabilityEditor - what a driver is cleared for", () => {
  it("lists each clearance with its work and place", async () => {
    renderEditor()
    expect(await screen.findByRole("button", { name: "Revoke" })).toBeInTheDocument()
    expect(screen.getAllByText("Inner North").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Deliver to customers").length).toBeGreaterThan(0)
    // Two sections, Collects and Delivers; the clearance sits under what it is for.
    expect(screen.getByRole("region", { name: "Delivers" })).toHaveTextContent("Inner North")
    expect(screen.getByRole("region", { name: "Collects" })).toHaveTextContent("Nowhere.")
  })

  it("082 - there is no delivery method anywhere on the screen", async () => {
    listCapabilities.mockResolvedValue({ items: [cap({})] })
    const { container } = renderEditor()
    await screen.findByRole("button", { name: "Revoke" })
    expect(container.textContent).not.toMatch(/same[- ]day|standard/i)
    expect(screen.queryByLabelText("Method")).not.toBeInTheDocument()
  })

  it("⚠ renders an everywhere grant as 'Everywhere', not as a list", async () => {
    listCapabilities.mockResolvedValue({
      items: [cap({ zoneId: null, zoneName: null })],
    })
    renderEditor()
    expect(await screen.findByText("Everywhere")).toBeInTheDocument()
  })

  it("⚠ says so plainly when a driver is cleared for nothing", async () => {
    listCapabilities.mockResolvedValue({ items: [] })
    renderEditor()
    expect(await screen.findByText(/Not cleared for any work/)).toBeInTheDocument()
  })

  it("⚠ sends zoneId: null - explicitly - when Every zone is chosen", async () => {
    const user = userEvent.setup()
    listCapabilities.mockResolvedValue({ items: [] })
    renderEditor()
    await screen.findByText(/Not cleared for any work/)

    await user.click(screen.getByRole("button", { name: /grant clearance/i }))

    await waitFor(() => {
      expect(grantCapability).toHaveBeenCalledWith("d-1", {
        function: "delivery",
        zoneId: null,
      })
    })
    // The key must be present, not merely undefined.
    expect("zoneId" in grantCapability.mock.calls[0]![1]).toBe(true)
  })

  it("revokes a single clearance", async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(await screen.findByRole("button", { name: "Revoke" }))
    await waitFor(() => expect(revokeCapability).toHaveBeenCalledWith("d-1", "c-1"))
  })

  it("⚠ hides every mutating control from a csa - absent, not disabled", async () => {
    roles.current = ["csa"]
    renderEditor()
    await waitFor(() => expect(screen.getAllByText("Inner North").length).toBeGreaterThan(0))
    expect(screen.queryByRole("button", { name: /grant clearance/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument()
  })
})
