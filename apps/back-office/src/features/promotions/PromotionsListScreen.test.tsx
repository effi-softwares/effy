import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminPromotionListItemDTO, BackOfficeRole } from "@effy/shared-types"

import { onePage, renderList } from "@/test/renderList"

const roleState = vi.hoisted(() => ({ roles: ["manager"] as BackOfficeRole[] }))
vi.mock("@/features/auth/queries", () => ({
  sessionQuery: {
    queryKey: ["auth", "session"],
    queryFn: async () => ({ status: "signed-in", identity: { roles: roleState.roles } }),
  },
}))

const listPromotions = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({ fetchPromotionPage: listPromotions }))
vi.mock("@/features/promotion-groups/repo", () => ({ listGroups: async () => [] }))

import { PromotionsListScreen } from "./PromotionsListScreen"

const ROW: AdminPromotionListItemDTO = {
  id: "p1",
  name: "Spring sale",
  kind: "cart",
  trigger: "code",
  state: "active",
  gives: "20% off your order, up to $15",
  who: "Everyone",
  codeSummary: "SPRING20",
  startsAt: null,
  endsAt: null,
  uses: 3,
  maxUses: 500,
  groups: ["Home hero"],
  updatedAt: "2026-10-01T00:00:00Z",
}
const COUNTS = { draft: 1, scheduled: 0, active: 1, paused: 0, used_up: 0, out_of_budget: 0, ended: 0, archived: 2 }
const page = (items: AdminPromotionListItemDTO[]) => ({ ...onePage(items), counts: COUNTS })

const wrap = (_: unknown) => renderList(PromotionsListScreen, "/promotions")

afterEach(() => {
  vi.clearAllMocks()
  roleState.roles = ["manager"]
})

describe("PromotionsListScreen (094)", () => {
  it("shows what a promotion gives, its code, who it is for, its uses against the cap and where it is shown", async () => {
    listPromotions.mockResolvedValue(page([ROW]))
    wrap(<PromotionsListScreen />)
    expect(await screen.findByText("Spring sale")).toBeInTheDocument()
    expect(screen.getByText("20% off your order, up to $15")).toBeInTheDocument()
    expect(screen.getByText("SPRING20")).toBeInTheDocument()
    expect(screen.getByText("3 of 500")).toBeInTheDocument()
    expect(screen.getByText("Home hero")).toBeInTheDocument()
  })

  it("counts every state in its view, and keeps archived ones out of All", async () => {
    listPromotions.mockResolvedValue(page([ROW]))
    wrap(<PromotionsListScreen />)
    await screen.findByText("Spring sale")
    await userEvent.click(screen.getByRole("combobox", { name: "Promotion views" }))
    expect(screen.getByRole("option", { name: /^All\s*2$/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /^Archived\s*2$/ })).toBeInTheDocument()
  })

  it("says an automatic promotion has no code", async () => {
    listPromotions.mockResolvedValue(page([{ ...ROW, trigger: "automatic", codeSummary: null }]))
    wrap(<PromotionsListScreen />)
    expect(await screen.findByText("Automatic")).toBeInTheDocument()
  })

  it("shows the empty state when nothing exists yet", async () => {
    listPromotions.mockResolvedValue({ ...page([]), counts: { ...COUNTS, draft: 0, active: 0, archived: 0 } })
    wrap(<PromotionsListScreen />)
    expect(await screen.findByText(/no promotions yet/i)).toBeInTheDocument()
  })

  it("offers Create promotion to a manager, and not to customer service", async () => {
    listPromotions.mockResolvedValue(page([ROW]))
    const { unmount } = wrap(<PromotionsListScreen />)
    expect(await screen.findByText(/create promotion/i)).toBeInTheDocument()
    unmount()
    roleState.roles = ["csa"]
    wrap(<PromotionsListScreen />)
    await screen.findByText("Spring sale")
    expect(screen.queryByText(/create promotion/i)).not.toBeInTheDocument()
  })
})
