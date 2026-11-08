import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BackOfficeRole } from "@effy/shared-types"

const repo = vi.hoisted(() => ({ getNotificationSettings: vi.fn(), updateNotificationSettings: vi.fn() }))
vi.mock("./repo", () => repo)
const roles = vi.hoisted(() => ({ current: ["admin"] as BackOfficeRole[] }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { NotificationSettingsScreen } = await import("./NotificationSettingsScreen")

const SETTINGS = { promoPushPerDay: 1, promoPushPerWeek: 3, updatedAt: "2026-11-10T00:00:00Z", updatedBy: "Effy" }

function show(as: BackOfficeRole[]) {
  roles.current = as
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <NotificationSettingsScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.getNotificationSettings.mockResolvedValue(SETTINGS)
  repo.updateNotificationSettings.mockResolvedValue({ ...SETTINGS, promoPushPerDay: 2, promoPushPerWeek: 5 })
})

describe("Settings › Notification limits (111 US3)", () => {
  it("a manager changes both limits", async () => {
    show(["manager"])
    const day = await screen.findByLabelText("Per day")
    const week = screen.getByLabelText("Per week")
    await userEvent.clear(day)
    await userEvent.type(day, "2")
    await userEvent.clear(week)
    await userEvent.type(week, "5")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(repo.updateNotificationSettings).toHaveBeenCalledWith({ promoPushPerDay: 2, promoPushPerWeek: 5 }))
  })

  it("a weekly limit below the daily one cannot be saved, and says why", async () => {
    show(["admin"])
    const week = await screen.findByLabelText("Per week")
    await userEvent.clear(week)
    await userEvent.type(week, "0")
    expect(screen.getByText("The weekly limit can't be lower than the daily limit.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("customer support reads the limits and changes nothing", async () => {
    show(["csa"])
    expect(await screen.findByLabelText("Per day")).toBeDisabled()
    expect(screen.getByRole("note")).toHaveTextContent("Only an administrator or manager can change these.")
  })
})
