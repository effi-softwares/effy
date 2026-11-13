import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TeamMemberDetailDTO } from "@effy/shared-types"

const repo = vi.hoisted(() => ({
  getMember: vi.fn(),
  setStatus: vi.fn(),
  changeRole: vi.fn(),
  removeMember: vi.fn(),
  signOutEverywhere: vi.fn(),
  sendInvitation: vi.fn(),
  repairMember: vi.fn(),
  renameMember: vi.fn(),
  loadMe: vi.fn(),
  renameMe: vi.fn(),
  memberActivityPath: (id: string) => `/admin/v1/staff/${id}/activity`,
}))
vi.mock("./repo", () => repo)

const { PersonScreen } = await import("./PersonScreen")

const ID = "00000000-0000-0000-0000-000000000001"
const member = (over: Partial<TeamMemberDetailDTO> = {}): TeamMemberDetailDTO => ({
  id: ID,
  subject: "s1",
  name: "Sam Lee",
  email: "sam@example.test",
  role: "manager",
  status: "active",
  lastSeenAt: null,
  addedAt: "2026-11-01T00:00:00.000Z",
  addedBy: { name: "Priya" },
  invitation: { sentAt: "2026-11-01T00:00:00.000Z", delivery: "bounced" },
  signInIssue: null,
  revision: 4,
  disabledAt: null,
  disabledBy: null,
  removedAt: null,
  removedBy: null,
  isYou: false,
  actions: ["rename", "role", "disable", "invite", "sign_out"],
  ...over,
})

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <PersonScreen staffId={ID} />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => vi.clearAllMocks())

describe("a team member's page (119)", () => {
  it("offers exactly the server's actions, and says the last invitation was not delivered", async () => {
    repo.getMember.mockResolvedValue(member())
    show()
    expect(await screen.findByRole("heading", { name: /Sam Lee/ })).toBeInTheDocument()
    for (const name of ["Change role", "Send invitation again", "Disable", "Sign out everywhere"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Re-enable" })).toBeNull()
    expect(screen.getByText(/Not delivered/)).toBeInTheDocument()
    expect(screen.getByText("Never signed in")).toBeInTheDocument()
  })

  it("yourself: only Rename, with the line that says why (FR-023)", async () => {
    repo.getMember.mockResolvedValue(member({ isYou: true, actions: ["rename"] }))
    show()
    expect(await screen.findByText("You cannot change your own access. Ask another administrator.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Disable" })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
  })

  it("disable asks with the spec's sentence and sends the revision it saw (FR-024)", async () => {
    repo.getMember.mockResolvedValue(member())
    const disabled = member({ status: "disabled", revision: 5, actions: ["rename", "enable", "remove"] })
    repo.setStatus.mockImplementation(async () => {
      repo.getMember.mockResolvedValue(disabled)
      return { member: disabled, complete: true }
    })
    show()
    await userEvent.click(await screen.findByRole("button", { name: "Disable" }))
    const dialog = screen.getByRole("alertdialog")
    expect(
      within(dialog).getByText("They will be signed out everywhere and will not be able to sign in. Their name stays on everything they did."),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Disable" }))
    expect(repo.setStatus).toHaveBeenCalledWith(ID, "disabled", 4)
    expect(await screen.findByRole("button", { name: "Remove" })).toBeInTheDocument()
  })

  it("a stale view is refused with the spec's sentence", async () => {
    repo.getMember.mockResolvedValue(member())
    repo.setStatus.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict", type: "https://effyshopping.com/problems/staff-changed" })
    show()
    await userEvent.click(await screen.findByRole("button", { name: "Disable" }))
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Disable" }))
    expect(await screen.findByText("Someone else changed this person. Look again.")).toBeInTheDocument()
  })

  it("change role: lowering says they will be signed out everywhere", async () => {
    repo.getMember.mockResolvedValue(member())
    show()
    await userEvent.click(await screen.findByRole("button", { name: "Change role" }))
    await userEvent.click(screen.getByRole("radio", { name: /Customer support/ }))
    expect(screen.getByText("They will be signed out everywhere.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: /Administrator/ }))
    expect(screen.queryByText("They will be signed out everywhere.")).toBeNull()
  })

  it("Needs attention says what disagrees and offers Repair", async () => {
    repo.getMember.mockResolvedValue(member({ signInIssue: "group_differs", actions: ["rename", "role", "disable", "invite", "sign_out", "repair"] }))
    show()
    expect(await screen.findByText(/holds a different role from their record/)).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Repair" }).length).toBeGreaterThan(0)
  })
})
