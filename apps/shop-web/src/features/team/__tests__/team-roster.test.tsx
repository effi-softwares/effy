import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { ShopTeamMemberDTO } from "@effy/shared-types"

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock("@/lib/api", () => ({ api, coreApi: api }))

const sessionQuery = vi.hoisted(() => ({ queryKey: ["session"], queryFn: vi.fn() }))
vi.mock("@/features/auth/queries", () => ({ sessionQuery }))

import { TeamRoster } from "../TeamRoster"

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

/**
 * US7 / FR-019b (T062) — the roster is readable by everyone; the actions are manager-only.
 *
 * ⚠ THIS IS NOT THE SECURITY BOUNDARY. The backend re-checks `shop_manager` against the platform
 * record on every write and refuses regardless of what renders. What these pin is that a `shop_staff`
 * operator is not shown controls that would only ever refuse — and, just as importantly, that they ARE
 * still shown the list, because knowing who you work with is not privileged.
 */
describe("team roster visibility", () => {
  it("shows the roster to a shop_staff operator", async () => {
    wrap(["shop_staff"], [member()])
    expect(await screen.findByText("Maya Oyelaran")).toBeInTheDocument()
    expect(screen.getByText("maya@effy.shop")).toBeInTheDocument()
  })

  it("offers no invite, no role control and no stand-down to shop_staff", async () => {
    wrap(["shop_staff"], [member()])
    await screen.findByText("Maya Oyelaran")

    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /stand down/i })).not.toBeInTheDocument()
  })

  it("renders the role as plain text for a non-manager", async () => {
    wrap(["shop_staff"], [member({ roles: ["shop_manager"] })])
    expect(await screen.findByText("Manager")).toBeInTheDocument()
  })

  it("offers every control to a manager", async () => {
    wrap(["shop_manager"], [member()])
    await screen.findByText("Maya Oyelaran")

    expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /stand down/i })).toBeInTheDocument()
  })

  /**
   * ⚠ A courtesy against locking yourself out, not the protection. The backend refuses removing the
   * LAST manager whoever asks — which is the case this cannot cover, since a manager standing down a
   * different sole manager is still a lockout.
   */
  it("withholds stand-down on the manager's own row", async () => {
    wrap(["shop_manager"], [member({ isSelf: true, roles: ["shop_manager"] })])
    await screen.findByText("Maya Oyelaran")
    expect(screen.queryByRole("button", { name: /stand down/i })).not.toBeInTheDocument()
  })

  it("offers no stand-down for someone already stood down", async () => {
    wrap(["shop_manager"], [member({ status: "disabled" })])
    expect(await screen.findByText("Stood down")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /stand down/i })).not.toBeInTheDocument()
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
