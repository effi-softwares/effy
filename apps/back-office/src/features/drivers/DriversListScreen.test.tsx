import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminDriverListItem } from "@effy/shared-types"

const listDrivers = vi.hoisted(() => vi.fn())
const listZones = vi.hoisted(() => vi.fn())
const getDuty = vi.hoisted(() => vi.fn())
const roles = vi.hoisted(() => ({ current: [] as string[] }))

vi.mock("./repo", () => ({
  fetchDriverPage: listDrivers,
  fetchDriverViews: async () => ({ views: { employed: 1, active: 1, suspended: 0, offboarded: 0, everyone: 1 } }),
  getReadiness: async () => ({ blocked: [], expiring: [], zones: [] }),
  listZones,
  getDuty,
  createDriver: vi.fn(),
  endDutySession: vi.fn(),
}))

vi.mock("@/features/auth/useSessionRoles", () => ({
  useSessionRoles: () => roles.current,
}))

import { onePage, renderList } from "@/test/renderList"

const { DriversListScreen } = await import("./DriversListScreen")

function driver(over: Partial<AdminDriverListItem> = {}): AdminDriverListItem {
  return {
    id: "d-1",
    name: "Sam Rivers",
    workEmail: "sam@effyshopping.com",
    capabilitySummary: { total: 4, coversEveryZone: false, functions: ["collection", "delivery"] },
    dutyState: "off_duty",
    status: "active",
    blockedReasons: [],
    ...over,
  }
}

const renderScreen = (url = "/drivers") => renderList(DriversListScreen, url)

beforeEach(() => {
  vi.clearAllMocks()
  roles.current = ["admin"]
  listDrivers.mockResolvedValue(onePage([driver()]))
  listZones.mockResolvedValue([{ id: "z-1", name: "Inner North" }])
  getDuty.mockResolvedValue({
    onDuty: [],
    unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 0 },
  })
})

describe("DriversListScreen - the register", () => {
  it("lists drivers with their clearance, duty state and employment status", async () => {
    renderScreen()
    expect(await screen.findByText("Sam Rivers")).toBeInTheDocument()
    expect(screen.getByText("sam@effyshopping.com")).toBeInTheDocument()
    expect(screen.getByText(/Collect \+ deliver/)).toBeInTheDocument()
    expect(screen.getByText("Off duty")).toBeInTheDocument()
  })

  it("⚠ SC-009 - a driver cleared for NOTHING says so on the register, before an order is affected", async () => {
    listDrivers.mockResolvedValue(onePage([
      driver({
        capabilitySummary: { total: 0, coversEveryZone: false, functions: [] },
        blockedReasons: ["no_capabilities"],
      }),
    ]))
    renderScreen()
    expect(await screen.findByText(/Not cleared for any work - cannot be given work/)).toBeInTheDocument()
  })

  it("explains the empty register instead of showing a bare empty table", async () => {
    listDrivers.mockResolvedValue(onePage([]))
    renderScreen()
    expect(await screen.findByText(/No drivers yet/)).toBeInTheDocument()
  })

  it("surfaces an error with a retry rather than an empty page", async () => {
    listDrivers.mockRejectedValue({ kind: "unavailable", status: 503, title: "Unavailable" })
    renderScreen()
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument())
  })

  it("⚠ hides every mutating control from a csa - absent, not disabled", async () => {
    roles.current = ["csa"]
    renderScreen()
    await screen.findByText("Sam Rivers")
    expect(screen.queryByRole("button", { name: /add driver/i })).not.toBeInTheDocument()
  })

  it("offers the create control to a manager", async () => {
    roles.current = ["manager"]
    renderScreen()
    expect(await screen.findByRole("button", { name: /add driver/i })).toBeInTheDocument()
  })

  it("⚠ pages the whole register - 053 shipped a console silently capped at 25 rows", async () => {
    listDrivers.mockResolvedValue(onePage([driver()], { total: 60 }))
    renderScreen()
    expect(await screen.findByText("1–1 of 60")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled()
  })

  it("disables Next when there is only one page", async () => {
    renderScreen()
    await screen.findByText("Sam Rivers")
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })
})

describe("DutyPanel - FR-036, the state that was invisible", () => {
  it("⚠ says NOBODY IS ON DUTY when work is waiting and nobody is working", async () => {
    getDuty.mockResolvedValue({
      onDuty: [],
      unassigned: { readyToCollect: 12, readyToDeliver: 0, driversOnDuty: 0 },
    })
    renderScreen()
    expect(await screen.findByText(/Nobody is on duty/)).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
  })

  it("⚠ shows a driver on duty and IDLE while work waits - the pair is the whole point", async () => {
    getDuty.mockResolvedValue({
      onDuty: [
        {
          driverId: "d-1",
          driverName: "Sam Rivers",
          zone: "Inner North",
          sessionId: "s-1",
          onDutySince: new Date(Date.now() - 3600_000).toISOString(),
          overdue: false,
        },
      ],
      unassigned: { readyToCollect: 4, readyToDeliver: 1, driversOnDuty: 1 },
    })
    renderScreen()
    expect(await screen.findByText(/waiting to be picked up/)).toBeInTheDocument()
    expect(screen.queryByText(/Nobody is on duty/)).not.toBeInTheDocument()
    expect(screen.getAllByText("Sam Rivers").length).toBeGreaterThan(1)
    expect(screen.getByText(/Idle - nothing is assigned/)).toBeInTheDocument()
  })

  it("says drivers go on duty from the app, so nobody looks for a control that is not there", async () => {
    renderScreen()
    expect(await screen.findByText(/Drivers go on duty from the driver app/)).toBeInTheDocument()
  })
})
