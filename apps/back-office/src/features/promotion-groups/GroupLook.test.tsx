import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { starterSettings, type AdminPromotionGroupDetailDTO, type AdminSkinListItemDTO } from "@effy/shared-types"

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }))
const groupRepo = vi.hoisted(() => ({ updateGroup: vi.fn() }))
vi.mock("./repo", () => groupRepo)
const promoRepo = vi.hoisted(() => ({ getPromotion: vi.fn() }))
vi.mock("@/features/promotions/repo", () => promoRepo)

const { LookPanel, MemberLookDialog } = await import("./GroupLook")

const classic: AdminSkinListItemDTO = {
  id: "c",
  name: "Classic",
  layout: "classic",
  version: 1,
  builtIn: true,
  usageCount: 6,
  updatedAt: "",
}
const tile: AdminSkinListItemDTO = {
  id: "t",
  name: "Tile — Effy blue",
  layout: "tile",
  version: 1,
  builtIn: false,
  usageCount: 0,
  settings: starterSettings("tile"),
  updatedAt: "",
}
const panel: AdminSkinListItemDTO = {
  id: "p",
  name: "Panel — Effy blue",
  layout: "panel",
  version: 1,
  builtIn: false,
  usageCount: 0,
  settings: starterSettings("panel"),
  updatedAt: "",
}

const member = {
  promotionId: "pr1",
  name: "Winter",
  headline: "10% off winter",
  state: "active" as const,
  position: 0,
  skinId: null,
  imageId: null,
  resolved: {
    id: "pr1",
    kind: "cart" as const,
    headline: "10% off winter",
    supportingLine: null,
    label: null,
    code: null,
    terms: null,
    endsIn: null,
    target: { kind: "promotion" as const, promotionId: "pr1" },
  },
}
const group: AdminPromotionGroupDetailDTO = {
  id: "g",
  key: "mega-nav",
  name: "Aisles menu",
  description: null,
  sort: 60,
  count: 1,
  size: "small",
  defaultSkin: { id: "c", name: "Classic", layout: "classic" },
  defaultCodeSkin: null,
  members: [member],
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

afterEach(() => vi.clearAllMocks())

describe("095 — how a group's place looks", () => {
  it("offers only skins whose layout fits the place's size", async () => {
    const user = userEvent.setup()
    wrap(<LookPanel group={group} skins={[classic, tile, panel]} canManage onError={() => undefined} />)
    await user.click(screen.getByLabelText("Default skin"))
    const defaults = within(screen.getByRole("listbox"))
    expect(defaults.getByRole("option", { name: "Tile — Effy blue" })).toBeInTheDocument()
    expect(defaults.queryByRole("option", { name: "Panel — Effy blue" })).not.toBeInTheDocument()
  })

  it("a member's skin and picture are previewed live and saved for this place only", async () => {
    const user = userEvent.setup()
    promoRepo.getPromotion.mockResolvedValue({ id: "pr1", images: [] })
    const onSave = vi.fn()
    wrap(
      <MemberLookDialog
        group={group}
        member={member}
        skins={[classic, tile]}
        pending={false}
        onClose={() => undefined}
        onSave={onSave}
      />,
    )
    expect(within(screen.getByTestId("member-look-preview")).getByText("Classic")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Skin"))
    await user.click(screen.getByRole("option", { name: "Tile — Effy blue" }))
    expect(within(screen.getByTestId("member-look-preview")).getByTestId("promo-skin")).toHaveAttribute(
      "data-layout",
      "tile",
    )
    await user.click(screen.getByRole("button", { name: "Use this look" }))
    expect(onSave).toHaveBeenCalledWith("t", null)
  })
})
