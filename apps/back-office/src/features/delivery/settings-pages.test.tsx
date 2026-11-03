import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentType } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BackOfficeRole, DeliveryDaysDTO } from "@effy/shared-types"

const repo = vi.hoisted(() => ({
  getDeliveryDays: vi.fn(),
  putDeliveryDays: vi.fn(),
  addNonDeliveryDate: vi.fn(),
  removeNonDeliveryDate: vi.fn(),
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  listCollectionRuns: vi.fn(),
  createCollectionRun: vi.fn(),
  deleteCollectionRun: vi.fn(),
}))
vi.mock("./repo", async () => ({ ...(await vi.importActual<object>("./repo")), ...repo }))

const roles = vi.hoisted(() => ({ current: ["manager"] as BackOfficeRole[] }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { DeliveryDaysScreen } = await import("./DeliveryDaysScreen")
const { HubScreen } = await import("./HubScreen")
const { DriverWorkScreen } = await import("./DriverWorkScreen")

/** The one record the three pages share, every field set to something other than its default. */
const DAYS: DeliveryDaysDTO = {
  noDeliveryWeekdays: [7],
  slotHoldMin: 10,
  hubTurnaroundMin: 60,
  effyLookaheadDays: 3,
  asapEstimate: "usually within 2–3 days",
  loadOverdueMin: 25,
  checkinOverdueMin: 35,
  vehicleCheckRequired: true,
  planningLeadMin: 40,
  perStopAllowanceMin: 9,
  dates: [{ day: "2026-12-25", label: "Christmas Day", affectedOrders: 0 }],
}
const SAVED = (({ dates: _d, ...rest }) => rest)(DAYS)

function show(Screen: ComponentType, as: BackOfficeRole[] = ["manager"]) {
  roles.current = as
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <Screen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

async function retype(label: RegExp | string, value: string) {
  const input = await screen.findByLabelText(label)
  await userEvent.clear(input)
  await userEvent.type(input, value)
  return input
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.getDeliveryDays.mockResolvedValue(DAYS)
  repo.putDeliveryDays.mockResolvedValue(DAYS)
  repo.addNonDeliveryDate.mockResolvedValue({ day: "2026-11-03", label: null, affectedOrders: 0 })
  repo.removeNonDeliveryDate.mockResolvedValue(undefined)
  repo.getSettings.mockResolvedValue({ hubLatitude: "-37.8142", hubLongitude: "144.9632", samedayPrepBufferMin: 60 })
  repo.putSettings.mockResolvedValue({ hubLatitude: "-37.8142", hubLongitude: "144.9632", samedayPrepBufferMin: 45 })
  repo.listCollectionRuns.mockResolvedValue([{ id: "r1", runTime: "14:00", label: "Afternoon run", status: "active" }])
})

describe("Settings › Delivery days", () => {
  it("shows the saved settings, with the closed weekday pressed and the closed dates listed", async () => {
    show(DeliveryDaysScreen)
    expect(await screen.findByLabelText(/delivery days offered after today/i)).toHaveValue("3")
    expect(screen.getByRole("button", { name: "Sun" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByText("2026-12-25")).toBeInTheDocument()
    expect(screen.getByText("Christmas Day")).toBeInTheDocument()
  })

  it("offers Save only once something changed, and Discard puts the saved values back", async () => {
    show(DeliveryDaysScreen)
    await screen.findByLabelText(/delivery days offered after today/i)
    // The bar is closed (inert, hidden from assistive tech) until there is something to save.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    const field = await retype(/delivery days offered after today/i, "5")
    await userEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(field).toHaveValue("3")
    expect(repo.putDeliveryDays).not.toHaveBeenCalled()
  })

  it("⚠ saves its own fields and sends every other page's exactly as they were read", async () => {
    show(DeliveryDaysScreen)
    await retype(/delivery days offered after today/i, "5")
    await userEvent.click(screen.getByRole("button", { name: "Sat" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(repo.putDeliveryDays).toHaveBeenCalledWith({ ...SAVED, effyLookaheadDays: 5, noDeliveryWeekdays: [6, 7] }),
    )
  })

  it("puts a named refusal on its field in the console's own words", async () => {
    repo.putDeliveryDays.mockRejectedValue({
      kind: "unknown",
      status: 400,
      title: "Refused",
      fields: [{ field: "effyLookaheadDays", message: "SERVER PROSE" }],
    })
    show(DeliveryDaysScreen)
    const field = await retype(/delivery days offered after today/i, "20")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(
      await screen.findByText("Customers can be offered between 1 and 14 delivery days after today."),
    ).toBeInTheDocument()
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByText(/SERVER PROSE/)).not.toBeInTheDocument()
  })

  it("says to set the hub first when the settings row does not exist yet", async () => {
    repo.putDeliveryDays.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict" })
    show(DeliveryDaysScreen)
    await retype(/hold a place in a window for/i, "15")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText(/set the hub's location in settings › hub and runs first/i)).toBeInTheDocument()
  })

  it("⚠ closing a date says how many placed orders carry it, and that they were not changed (FR-043)", async () => {
    repo.addNonDeliveryDate.mockResolvedValue({ day: "2026-11-03", label: "Cup Day", affectedOrders: 2 })
    show(DeliveryDaysScreen)
    await userEvent.type(await screen.findByLabelText("Date"), "2026-11-03")
    await userEvent.type(screen.getByLabelText(/reason/i), "Cup Day")
    await userEvent.click(screen.getByRole("button", { name: "Close date" }))
    await waitFor(() => expect(repo.addNonDeliveryDate).toHaveBeenCalledWith({ day: "2026-11-03", label: "Cup Day" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 placed orders are already promised 2026-11-03. They have not been changed.",
    )
  })

  it("reopens a date", async () => {
    show(DeliveryDaysScreen)
    await userEvent.click(await screen.findByRole("button", { name: "Reopen" }))
    await waitFor(() => expect(repo.removeNonDeliveryDate).toHaveBeenCalledWith("2026-12-25"))
  })

  it("a role that cannot manage delivery sees everything and can change nothing", async () => {
    show(DeliveryDaysScreen, ["csa"])
    expect(await screen.findByLabelText(/delivery days offered after today/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: "Sun" })).toBeDisabled()
    expect(screen.getByRole("note")).toHaveTextContent(/only an administrator or manager/i)
    expect(screen.queryByRole("button", { name: "Close date" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument()
  })
})

describe("Settings › Hub and runs", () => {
  it("⚠ labels the unmeasured hub turnaround as an estimate, not a fact", async () => {
    show(HubScreen)
    await screen.findByLabelText(/hub turnaround/i)
    expect(screen.getAllByText(/^Estimate - not yet timed/)).toHaveLength(1)
    expect(await screen.findByText("14:00")).toBeInTheDocument()
  })

  it("a turnaround change saves the delivery-day record alone, leaving the hub untouched", async () => {
    show(HubScreen)
    await retype(/hub turnaround/i, "75")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(repo.putDeliveryDays).toHaveBeenCalledWith({ ...SAVED, hubTurnaroundMin: 75 }))
    expect(repo.putSettings).not.toHaveBeenCalled()
  })

  it("a prep-buffer change saves the hub alone, and says what a move recalculated", async () => {
    repo.putSettings.mockResolvedValue({
      hubLatitude: "-37.9",
      hubLongitude: "144.9632",
      samedayPrepBufferMin: 60,
      distances: { recomputed: 4, unchanged: 1, manualFlagged: 2 },
    })
    show(HubScreen)
    await retype("Latitude", "-37.9")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(repo.putSettings).toHaveBeenCalledWith({
        hubLatitude: "-37.9",
        hubLongitude: "144.9632",
        samedayPrepBufferMin: 60,
      }),
    )
    expect(repo.putDeliveryDays).not.toHaveBeenCalled()
  })
})

describe("Settings › Driver work", () => {
  it("shows the planning settings that had no screen before (planning lead, time at each stop)", async () => {
    show(DriverWorkScreen)
    expect(await screen.findByLabelText(/open a round before it starts by/i)).toHaveValue("40")
    expect(screen.getByLabelText(/time at each stop/i)).toHaveValue("9")
    expect(screen.getByRole("switch", { name: /check their vehicle/i })).toBeChecked()
  })

  it("⚠ saves its own fields and keeps Delivery days' and the hub's exactly as read", async () => {
    show(DriverWorkScreen)
    await retype(/open a round before it starts by/i, "30")
    await retype(/time at each stop/i, "11")
    await userEvent.click(screen.getByRole("switch", { name: /check their vehicle/i }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(repo.putDeliveryDays).toHaveBeenCalledWith({
        ...SAVED,
        planningLeadMin: 30,
        perStopAllowanceMin: 11,
        vehicleCheckRequired: false,
      }),
    )
  })

  it("keeps Save off while a value isn't a whole number", async () => {
    show(DriverWorkScreen)
    await userEvent.clear(await screen.findByLabelText(/time at each stop/i))
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })
})
