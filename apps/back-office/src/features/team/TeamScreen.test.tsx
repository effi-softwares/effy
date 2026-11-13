import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TeamListDTO, TeamMemberDTO } from "@effy/shared-types"

const repo = vi.hoisted(() => ({
  fetchTeamPage: vi.fn(),
  checkSignIn: vi.fn(),
  addPerson: vi.fn(),
  deleteSignInAccount: vi.fn(),
  loadMe: vi.fn(),
  getMember: vi.fn(),
  setStatus: vi.fn(),
}))
vi.mock("./repo", () => repo)

const { TeamScreen, PERMISSIONS } = await import("./TeamScreen")

const member = (over: Partial<TeamMemberDTO>): TeamMemberDTO => ({
  id: "00000000-0000-0000-0000-000000000001",
  subject: "s1",
  name: "Sam Lee",
  email: "sam@example.test",
  role: "manager",
  status: "active",
  lastSeenAt: null,
  addedAt: "2026-11-01T00:00:00.000Z",
  addedBy: null,
  invitation: null,
  signInIssue: null,
  revision: 1,
  ...over,
})

const page = (rows: TeamMemberDTO[], extra: Partial<TeamListDTO> = {}): TeamListDTO => ({
  items: rows,
  pageSize: 25,
  total: rows.length,
  totalCapped: false,
  page: 1,
  nextCursor: null,
  ignored: [],
  notOnTeam: [],
  checkedAt: null,
  ...extra,
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
  repo.checkSignIn.mockResolvedValue({ checked: false })
  repo.fetchTeamPage.mockResolvedValue(
    page([
      member({}),
      member({ id: "00000000-0000-0000-0000-000000000002", subject: "s2", name: null, email: "ops@example.test", role: null, status: "disabled", signInIssue: "no_role" }),
    ]),
  )
})

describe("Settings › Team and access (119)", () => {
  it("lists the team: name or email, one role, status with Needs attention, Never signed in", async () => {
    show()
    expect(await screen.findByText("Sam Lee")).toBeInTheDocument()
    const table = screen.getByRole("table", { name: "Team" })
    expect(within(table).getByText("Manager")).toBeInTheDocument()
    expect(within(table).getByText("ops@example.test")).toBeInTheDocument()
    expect(within(table).getByText("No role")).toBeInTheDocument()
    expect(within(table).getByText("Disabled")).toBeInTheDocument()
    expect(within(table).getByText("Needs attention")).toBeInTheDocument()
    expect(within(table).getAllByText("Never signed in")).toHaveLength(2)
  })

  it("compares the sign-in pool with the records when it opens (R6)", async () => {
    show()
    await screen.findByText("Sam Lee")
    expect(repo.checkSignIn).toHaveBeenCalledTimes(1)
  })

  it("shows sign-in accounts with no record, each with its two actions (FR-030)", async () => {
    repo.fetchTeamPage.mockResolvedValue(
      page([member({})], { notOnTeam: [{ username: "u-9", email: "stray@example.test", enabled: true, groups: ["admin"], createdAt: null }] }),
    )
    show()
    expect(await screen.findByText("Not on the team")).toBeInTheDocument()
    expect(screen.getByText("stray@example.test")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add to the team" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete sign-in account" })).toBeInTheDocument()
  })

  it("adds a person; an email already on the team is refused with the spec's sentence", async () => {
    repo.addPerson.mockRejectedValue({
      kind: "unknown",
      status: 409,
      title: "Conflict",
      type: "https://effyshopping.com/problems/already-on-team",
      fields: [{ field: "memberId", message: "00000000-0000-0000-0000-000000000001" }],
    })
    show()
    await userEvent.click(await screen.findByRole("button", { name: "Add person" }))
    await userEvent.type(screen.getByLabelText("Work email"), "sam@example.test")
    await userEvent.type(screen.getByLabelText("Full name"), "Sam Lee")
    await userEvent.click(screen.getByRole("radio", { name: /Customer support/ }))
    expect(screen.getByRole("checkbox", { name: "Email them an invitation" })).toBeChecked()
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add person" }))
    expect(repo.addPerson.mock.calls[0]![0]).toEqual({ email: "sam@example.test", name: "Sam Lee", role: "csa", invite: true })
    expect(await screen.findByText("This person is already on the team.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open them" })).toBeInTheDocument()
  })

  it("says the backend refused when the caller is not an administrator", async () => {
    repo.fetchTeamPage.mockRejectedValue({ kind: "forbidden", status: 403, title: "Forbidden" })
    show()
    expect(await screen.findByText("Only an administrator can see the team.")).toBeInTheDocument()
  })

  it("shows what each role may do, from each feature's own rule (FR-033)", async () => {
    show()
    await userEvent.click(await screen.findByRole("tab", { name: /Roles and permissions/ }))
    const row = screen.getByRole("row", { name: /Change tax settings, and see the team/ })
    expect(within(row).getAllByLabelText("Allowed")).toHaveLength(1)
    expect(within(row).getAllByLabelText("Not allowed")).toHaveLength(2)
    expect(PERMISSIONS.every((p) => p.rule(["admin"]))).toBe(true)
  })
})
