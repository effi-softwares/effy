import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { BackOfficeRole } from "@effy/shared-types"

const roles = vi.hoisted(() => ({ current: ["admin"] as BackOfficeRole[] }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

import { NAV_GROUPS } from "@/components/shell/nav"

import { SETTINGS_GROUPS, SettingsIndexScreen, visibleSettings } from "./SettingsIndexScreen"

const settingsLeaves = NAV_GROUPS.find((g) => g.label === "Settings")!
  .items.flatMap((i) => i.subs ?? [i])
  .filter((l) => l.key !== "settings")
const entries = SETTINGS_GROUPS.flatMap((g) => g.entries)

function show(as: BackOfficeRole[]) {
  roles.current = as
  const qc = new QueryClient()
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <SettingsIndexScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("Settings index (settings redesign)", () => {
  it("lists exactly the sidebar's settings pages, at the same addresses, behind the same roles", () => {
    expect(entries.map((e) => e.key).sort()).toEqual(settingsLeaves.map((l) => l.key).sort())
    for (const leaf of settingsLeaves) {
      const entry = entries.find((e) => e.key === leaf.key)!
      expect(entry.to, leaf.key).toBe(leaf.to)
      expect(entry.requiredRole, leaf.key).toBe(leaf.requiredRole)
    }
  })

  it("keeps the administrator-only pages from everyone else", () => {
    const keys = (r: BackOfficeRole[]) => visibleSettings(r).flatMap((g) => g.entries.map((e) => e.key))
    expect(keys(["admin"])).toEqual(expect.arrayContaining(["tax", "team"]))
    for (const r of [["manager"], ["csa"]] as BackOfficeRole[][]) {
      expect(keys(r)).not.toContain("tax")
      expect(keys(r)).not.toContain("team")
    }
    // The Business group has nothing left for them, so it is not drawn at all.
    expect(visibleSettings(["csa"]).map((g) => g.title)).not.toContain("Business")
  })

  it("draws each page as a link with its sentence", async () => {
    show(["admin"])
    const link = await screen.findByRole("link", { name: /Driver work/ })
    expect(link).toHaveAttribute("href", "/settings/drivers")
    expect(link).toHaveTextContent("When rounds open, time at each stop")
    expect(screen.getByRole("link", { name: /Team and access/ })).toHaveAttribute("href", "/settings/team")
  })

  it("shows customer support no Business section", async () => {
    show(["csa"])
    await screen.findByRole("link", { name: /Coverage/ })
    expect(screen.queryByRole("heading", { name: "Business" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Tax and invoices/ })).not.toBeInTheDocument()
  })
})
