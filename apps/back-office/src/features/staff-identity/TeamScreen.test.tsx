import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { StaffMemberDTO } from "@effy/shared-types"

const loadTeam = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({ loadTeam, loadMe: vi.fn() }))

const { TeamScreen, PERMISSIONS } = await import("./TeamScreen")

const member = (over: Partial<StaffMemberDTO>): StaffMemberDTO => ({
  subject: "s1",
  name: "Sam Lee",
  email: "sam@example.test",
  roles: ["manager"],
  status: "active",
  lastSeenAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
})

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <TeamScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  loadTeam.mockResolvedValue([
    member({}),
    member({ subject: "s2", name: null, email: "ops@example.test", roles: [], status: "disabled" }),
  ])
})

describe("Settings › Team and access", () => {
  it("lists everyone with a back-office account: name or email, role, status, last seen", async () => {
    show()
    expect(await screen.findByText("Sam Lee")).toBeInTheDocument()
    const table = screen.getByRole("table", { name: "Team" })
    expect(within(table).getByText("Manager")).toBeInTheDocument()
    expect(within(table).getByText("ops@example.test")).toBeInTheDocument()
    expect(within(table).getByText(/No role - can't use back-office/)).toBeInTheDocument()
    expect(within(table).getByText("Disabled")).toBeInTheDocument()
    expect(within(table).getAllByText("Never")).toHaveLength(2)
    // The tab counts the active people only.
    expect(screen.getByRole("tab", { name: /People/ })).toHaveTextContent("1")
  })

  it("says the backend refused when the caller is not an administrator", async () => {
    loadTeam.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" })
    show()
    expect(await screen.findByText("Only an administrator can see the team.")).toBeInTheDocument()
  })

  it("shows what each role may do, from each feature's own rule", async () => {
    show()
    await userEvent.click(await screen.findByRole("tab", { name: /Roles and permissions/ }))
    const row = screen.getByRole("row", { name: /Change tax settings, and see the team/ })
    expect(within(row).getAllByLabelText("Allowed")).toHaveLength(1)
    expect(within(row).getAllByLabelText("Not allowed")).toHaveLength(2)
    expect(PERMISSIONS.every((p) => p.rule(["admin"]))).toBe(true)
  })
})
