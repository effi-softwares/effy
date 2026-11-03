import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ShopTeamMemberDTO } from "@effy/shared-types"

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock("@/lib/api", () => ({ api }))

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }))
vi.mock("@/features/auth/queries", () => ({ sessionQuery }))

import { TeamRoster } from "../TeamRoster"

beforeEach(() => vi.clearAllMocks())

function member(over: Partial<ShopTeamMemberDTO> = {}): ShopTeamMemberDTO {
  return {
    staffId: "st-1",
    email: "maya@effy.shop",
    name: "Maya Oyelaran",
    roles: ["shop_staff"],
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    lastSeenAt: null,
    isSelf: false,
    ...over,
  }
}

function wrap(roles: string[], team: ShopTeamMemberDTO[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(["session"], {
    status: "signed-in",
    identity: { subject: "s1", email: "me@effy.shop", roles },
  })
  api.get.mockResolvedValue(team)
  return render(
    <QueryClientProvider client={qc}>
      <TeamRoster />
    </QueryClientProvider>,
  )
}

describe("team roster visibility", () => {
  it("shows the roster to a shop_staff operator", async () => {
    wrap(["shop_staff"], [member()])
    expect(await screen.findByText("Maya Oyelaran")).toBeInTheDocument()
    expect(screen.getByText("maya@effy.shop")).toBeInTheDocument()
  })

  it("offers no invite and no edit to shop_staff", async () => {
    wrap(["shop_staff"], [member()])
    await screen.findByText("Maya Oyelaran")

    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument()
  })

  it("renders the role as plain text for a non-manager", async () => {
    wrap(["shop_staff"], [member({ roles: ["shop_manager"] })])
    expect(await screen.findByText("Manager")).toBeInTheDocument()
  })

  it("offers invite and an edit for every colleague to a manager", async () => {
    wrap(["shop_manager"], [member(), member({ staffId: "st-2", name: "Sam", status: "disabled" })])
    await screen.findByText("Maya Oyelaran")

    expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Maya Oyelaran" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Sam" })).toBeInTheDocument()
  })

  it("saves only what changed: a new name", async () => {
    api.patch.mockResolvedValue(undefined)
    wrap(["shop_manager"], [member()])
    fireEvent.click(await screen.findByRole("button", { name: "Edit Maya Oyelaran" }))

    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Maya O.  " } })
    fireEvent.click(save)

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/shop/v1/team/st-1", { name: "Maya O." }))
  })

  it("shows the email but never lets it be edited", async () => {
    wrap(["shop_manager"], [member()])
    fireEvent.click(await screen.findByRole("button", { name: "Edit Maya Oyelaran" }))
    expect(screen.getByLabelText("Work email")).toHaveValue("maya@effy.shop")
    expect(screen.getByLabelText("Work email")).toBeDisabled()
  })

  it("stands a colleague down only after confirming", async () => {
    api.patch.mockResolvedValue(undefined)
    wrap(["shop_manager"], [member()])
    fireEvent.click(await screen.findByRole("button", { name: "Edit Maya Oyelaran" }))
    fireEvent.click(screen.getByRole("button", { name: "Stand down" }))
    expect(api.patch).not.toHaveBeenCalled()

    // The confirmation sheet opens over the edit dialog; its "Stand down" is the last one.
    await screen.findByText("Stand down Maya Oyelaran?")
    fireEvent.click(screen.getAllByRole("button", { name: "Stand down" }).at(-1)!)
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/shop/v1/team/st-1", { status: "disabled" }))
  })

  it("withholds stand-down on the manager's own row", async () => {
    wrap(["shop_manager"], [member({ isSelf: true, roles: ["shop_manager"] })])
    fireEvent.click(await screen.findByRole("button", { name: "Edit Maya Oyelaran" }))
    expect(screen.queryByRole("button", { name: /stand down/i })).not.toBeInTheDocument()
  })

  it("reinstates someone who was stood down", async () => {
    api.patch.mockResolvedValue(undefined)
    wrap(["shop_manager"], [member({ status: "disabled" })])
    fireEvent.click(await screen.findByRole("button", { name: "Edit Maya Oyelaran" }))
    expect(screen.queryByRole("button", { name: /stand down/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reinstate" }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/shop/v1/team/st-1", { status: "active" }))
  })

  it("distinguishes active from stood down without relying on colour", async () => {
    wrap(["shop_manager"], [member({ staffId: "a" }), member({ staffId: "b", status: "disabled" })])
    await screen.findByText("Active")
    expect(screen.getByText("Stood down")).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(/text-(red|amber|yellow|orange)-/)
  })

  it("writes nothing from merely rendering", async () => {
    wrap(["shop_manager"], [member()])
    await screen.findByText("Maya Oyelaran")
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })
})
