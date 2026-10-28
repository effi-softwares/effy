import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { VehicleListItem } from "@effy/shared-types"

import { onePage, renderList } from "@/test/renderList"

const listVehicles = vi.hoisted(() => vi.fn())
const roles = vi.hoisted(() => ({ current: [] as string[] }))

vi.mock("./repo", () => ({
  fetchVehiclePage: listVehicles,
  fetchVehicleViews: async () => ({ views: { fleet: 1, active: 1, off_road: 0, retired: 0 } }),
  createVehicle: vi.fn(),
}))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { VehiclesListScreen } = await import("./VehiclesListScreen")

function vehicle(over: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    id: "v-1",
    registrationPlate: "EFY-001",
    make: "Toyota",
    model: "HiAce",
    bodyType: "van",
    ownership: "effy_owned",
    canCarryChilled: false,
    canCarryFrozen: false,
    status: "active",
    currentHolderDriverId: null,
    currentHolderName: null,
    complianceIssues: [],
    ...over,
  }
}

const renderScreen = (url = "/vehicles") => renderList(VehiclesListScreen, url)

beforeEach(() => {
  vi.clearAllMocks()
  roles.current = ["admin"]
  listVehicles.mockResolvedValue(onePage([vehicle()]))
})

describe("VehiclesListScreen — the register", () => {
  it("lists a vehicle with its plate, make, body type and owner", async () => {
    renderScreen()
    expect(await screen.findByText("EFY-001")).toBeInTheDocument()
    expect(screen.getByText(/Toyota HiAce/)).toBeInTheDocument()
    expect(screen.getByText("Van")).toBeInTheDocument()
    expect(screen.getByText("Effy owned")).toBeInTheDocument()
  })

  it("⚠ names the lapsed compliance item in the row, not a bare 'non-compliant'", async () => {
    listVehicles.mockResolvedValue(onePage([vehicle({ complianceIssues: ["registration_expired"] })]))
    renderScreen()
    expect(await screen.findByText(/Registration expired/)).toBeInTheDocument()
  })

  it("shows every lapsed item when several have lapsed at once", async () => {
    listVehicles.mockResolvedValue(onePage([vehicle({ complianceIssues: ["registration_expired", "roadworthy_expired"] })]))
    renderScreen()
    expect(await screen.findByText(/Registration expired · Roadworthy inspection overdue/)).toBeInTheDocument()
  })

  it("shows refrigeration capability without opening the record", async () => {
    listVehicles.mockResolvedValue(onePage([vehicle({ canCarryChilled: true, canCarryFrozen: true })]))
    renderScreen()
    expect(await screen.findByText("Chilled · Frozen")).toBeInTheDocument()
  })

  it("says a vehicle is available when nobody holds it, rather than leaving the cell blank", async () => {
    renderScreen()
    expect(await screen.findByText("Available")).toBeInTheDocument()
  })

  it("names the holder, and links to them, when a vehicle is out", async () => {
    listVehicles.mockResolvedValue(onePage([vehicle({ currentHolderDriverId: "d-9", currentHolderName: "Sam Rivers" })]))
    renderScreen()
    expect(await screen.findByText("Sam Rivers")).toBeInTheDocument()
  })

  it("⚠ hides every mutating control from a csa — absent, not disabled", async () => {
    roles.current = ["csa"]
    renderScreen()
    await screen.findByText("EFY-001")
    expect(screen.queryByRole("button", { name: /add vehicle/i })).not.toBeInTheDocument()
  })

  it("offers the create control to a manager", async () => {
    roles.current = ["manager"]
    renderScreen()
    expect(await screen.findByRole("button", { name: /add vehicle/i })).toBeInTheDocument()
  })

  it("⚠ 103: pages the whole register on the server, rather than silently capping it", async () => {
    listVehicles.mockResolvedValue(onePage([vehicle()], { total: 60 }))
    renderScreen()
    expect(await screen.findByText("1–1 of 60")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled()
  })

  it("103: the search and filters reach the server, and come from the address", async () => {
    renderScreen("/vehicles?q=efy&owner=driver_owned&view=retired")
    await screen.findByText("EFY-001")
    const qs = String(listVehicles.mock.calls.at(-1)![0])
    expect(qs).toContain("q=efy")
    expect(qs).toContain("owner=driver_owned")
    expect(qs).toContain("view=retired")
  })

  it("disables Next when there is only one page", async () => {
    renderScreen()
    await screen.findByText("EFY-001")
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })

  it("explains an empty register instead of showing a bare empty table", async () => {
    listVehicles.mockResolvedValue(onePage([]))
    renderScreen()
    expect(await screen.findByText(/No vehicles yet/)).toBeInTheDocument()
  })

  it("surfaces an error with a retry rather than an empty page", async () => {
    listVehicles.mockRejectedValue({ kind: "unavailable", status: 503, title: "Unavailable" })
    renderScreen()
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument()
  })
})
