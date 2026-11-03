import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BackOfficeRole } from "@effy/shared-types"

const repo = vi.hoisted(() => ({ getPointsSettings: vi.fn(), updatePointsSettings: vi.fn() }))
vi.mock("./repo", async () => ({ ...(await vi.importActual<object>("./repo")), ...repo }))
const roles = vi.hoisted(() => ({ current: ["admin"] as BackOfficeRole[] }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { PointsSettingsScreen } = await import("./PointsSettingsScreen")

const SETTINGS = { centsPerPoint: 1, expiryMonths: 12, csaCreditLimitPoints: 2000, warningDays: 30, holdMinutes: 30 }

function show(as: BackOfficeRole[]) {
  roles.current = as
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <PointsSettingsScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.getPointsSettings.mockResolvedValue(SETTINGS)
  repo.updatePointsSettings.mockResolvedValue({ ...SETTINGS, expiryMonths: 18 })
})

describe("Settings › Points", () => {
  it("sends only the rule that changed", async () => {
    show(["admin"])
    const expiry = await screen.findByLabelText("Points last")
    await userEvent.clear(expiry)
    await userEvent.type(expiry, "18")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(repo.updatePointsSettings).toHaveBeenCalledWith({ expiryMonths: 18 }))
  })

  it("a manager reads the rules and changes nothing", async () => {
    show(["manager"])
    expect(await screen.findByLabelText("Value of a point")).toBeDisabled()
    expect(screen.getByRole("note")).toHaveTextContent("Only an administrator can change these.")
  })
})
