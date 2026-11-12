import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { HousekeepingDTO } from "@effy/shared-types"

const repo = vi.hoisted(() => ({ getHousekeeping: vi.fn(), updateHousekeepingSettings: vi.fn() }))
vi.mock("./repo", () => repo)

const { HousekeepingScreen } = await import("./HousekeepingScreen")

const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()

const PAGE = (mayEdit: boolean): HousekeepingDTO => ({
  abandonAfterMinutes: 1440,
  version: "2026-11-12T00:00:00.000Z",
  mayEdit,
  jobs: [
    {
      job: "unpaid_orders",
      lastRun: { startedAt: at(5), finishedAt: at(5), outcome: "ok", counts: { closed: 14, stillPaying: 1 }, problem: null },
      nextRunAt: at(-10),
      attention: null,
    },
    {
      job: "account_erasure",
      lastRun: { startedAt: at(30), finishedAt: at(30), outcome: "partial", counts: { erased: 1, retried: 1 }, problem: "sign-in: TooManyRequestsException" },
      nextRunAt: at(-30),
      attention: "partial",
    },
    {
      job: "phone_registrations",
      lastRun: { startedAt: at(600), finishedAt: at(600), outcome: "failed", counts: {}, problem: "run: Error" },
      nextRunAt: at(-840),
      attention: "failed",
    },
  ],
})

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <HousekeepingScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.getHousekeeping.mockResolvedValue(PAGE(true))
  repo.updateHousekeepingSettings.mockResolvedValue({ ...PAGE(true), abandonAfterMinutes: 720 })
})

describe("Settings › Clean-ups (113 US5)", () => {
  it("shows each clean-up: what it did, and marks one that failed or partly worked", async () => {
    show()
    // The skeleton draws the same table first; wait for the rows.
    await screen.findByText("Closed 14 unpaid orders · 1 still being paid")
    const table = screen.getByRole("table", { name: "Clean-ups" })
    expect(within(table).getAllByText(/Unpaid orders/).length).toBeGreaterThan(0)
    expect(within(table).getByText("Closed 14 unpaid orders · 1 still being paid")).toBeTruthy()
    expect(within(table).getByText("Worked")).toBeTruthy()
    expect(within(table).getByText("Partly worked")).toBeTruthy()
    expect(within(table).getByText("sign-in: TooManyRequestsException")).toBeTruthy()
    expect(within(table).getByText("Failed")).toBeTruthy()
  })

  it("an administrator changes the abandon time, in hours, against the version read", async () => {
    show()
    const input = await screen.findByLabelText("Abandon time")
    expect(input).toHaveValue("24")
    await userEvent.clear(input)
    await userEvent.type(input, "12")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(repo.updateHousekeepingSettings).toHaveBeenCalledWith(
        { abandonAfterMinutes: 720, version: "2026-11-12T00:00:00.000Z" },
        expect.anything(),
      ),
    )
  })

  it("refuses an abandon time outside 1 hour to 7 days", async () => {
    show()
    const input = await screen.findByLabelText("Abandon time")
    await userEvent.clear(input)
    await userEvent.type(input, "169")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("a manager or CSA sees the abandon time but can't change it", async () => {
    repo.getHousekeeping.mockResolvedValue(PAGE(false))
    show()
    expect(await screen.findByLabelText("Abandon time")).toBeDisabled()
    expect(screen.getByText("Only an administrator can change the abandon time.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })
})
