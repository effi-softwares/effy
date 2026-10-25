import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { starterSettings, type AdminSkinDTO, type BackOfficeRole } from "@effy/shared-types"

const navigate = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
}))
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))

const roleState = vi.hoisted(() => ({ roles: ["manager"] as BackOfficeRole[] }))
vi.mock("@/features/auth/queries", () => ({
  sessionQuery: {
    queryKey: ["auth", "session"],
    queryFn: async () => ({ status: "signed-in", identity: { roles: roleState.roles } }),
  },
}))

const repo = vi.hoisted(() => ({
  getSkin: vi.fn(),
  createSkin: vi.fn(),
  updateSkin: vi.fn(),
  duplicateSkin: vi.fn(),
  deleteSkin: vi.fn(),
  listSkins: vi.fn(),
}))
vi.mock("./repo", () => repo)

const { SkinEditorScreen } = await import("./SkinEditorScreen")

const SKIN: AdminSkinDTO = {
  id: "s1",
  name: "Winter",
  layout: "panel",
  version: 4,
  builtIn: false,
  usageCount: 2,
  settings: starterSettings("panel"),
  updatedAt: "",
  usage: {
    placements: 1,
    groups: [{ id: "g", key: "home-hero", name: "Home hero", members: 1 }],
    defaultOf: [{ id: "g2", key: "offers", name: "Offers page", forCode: false }],
  },
  createdBy: "s",
  updatedBy: null,
  createdAt: "",
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

afterEach(() => {
  vi.clearAllMocks()
  roleState.roles = ["manager"]
})

describe("SkinEditorScreen (095)", () => {
  it("previews the skin with the website's renderer and shows every pair readable", async () => {
    wrap(<SkinEditorScreen />)
    expect(await screen.findByTestId("skin-preview")).toBeInTheDocument()
    expect(screen.getByTestId("promo-skin")).toHaveAttribute("data-layout", "panel")
    expect(screen.getByTestId("skin-contrast")).not.toHaveTextContent("too faint")
  })

  it("⚠ an unreadable colour blocks saving and names the pair", async () => {
    const user = userEvent.setup()
    wrap(<SkinEditorScreen />)
    await user.type(await screen.findByLabelText("Name"), "Sunny")
    const bg = screen.getByLabelText("Colour")
    await user.clear(bg)
    await user.type(bg, "#facc15")
    expect(screen.getByTestId("skin-contrast")).toHaveTextContent("Headline on the background")
    expect(screen.getByTestId("skin-contrast")).toHaveTextContent("too faint")
    expect(screen.getByRole("button", { name: "Create skin" })).toBeDisabled()
  })

  it("creates a readable skin with its settings, and switching layout keeps the colours", async () => {
    const user = userEvent.setup()
    repo.createSkin.mockResolvedValue({ ...SKIN, id: "new" })
    wrap(<SkinEditorScreen />)
    await user.type(await screen.findByLabelText("Name"), "Winter tile")
    await user.click(screen.getByRole("radio", { name: /^Tile/ }))
    await user.click(screen.getByRole("button", { name: "Create skin" }))
    await waitFor(() =>
      expect(repo.createSkin).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Winter tile",
          layout: "tile",
          settings: expect.objectContaining({ background: expect.objectContaining({ colour: "#1d4ed8" }) }),
        }),
      ),
    )
    expect(navigate).toHaveBeenCalledWith({ to: "/promotions/skins/$skinId", params: { skinId: "new" } })
  })

  it("saving a skin in use asks first, naming how many places change, and sends the version edited", async () => {
    const user = userEvent.setup()
    repo.getSkin.mockResolvedValue(SKIN)
    repo.updateSkin.mockResolvedValue(SKIN)
    wrap(<SkinEditorScreen skinId="s1" />)
    expect(await screen.findByTestId("skin-usage")).toHaveTextContent("Default of Offers page")
    expect(await screen.findByRole("button", { name: "Delete" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Save skin" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("2 places wear it")
    await user.click(screen.getByRole("button", { name: "Save everywhere" }))
    await waitFor(() =>
      expect(repo.updateSkin).toHaveBeenCalledWith("s1", expect.objectContaining({ expectedVersion: 4 })),
    )
  })

  it("a customer-service agent sees the skin and can change nothing", async () => {
    roleState.roles = ["csa"]
    repo.getSkin.mockResolvedValue(SKIN)
    wrap(<SkinEditorScreen skinId="s1" />)
    expect(await screen.findByTestId("skin-preview")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save skin" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toBeDisabled()
  })
})
