import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { LowStockRowDTO } from "@effy/shared-types"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  // 057: the rebuilt screens navigate from the breadcrumb, so the mock must supply this too.
  useNavigate: () => () => {},
}))

const getLowStock = vi.hoisted(() => vi.fn())
const getStockSettings = vi.hoisted(() => vi.fn())
vi.mock("../stockRepo", () => ({
  getLowStock,
  getStockSettings,
  setStockSettings: vi.fn(),
  getProductStock: vi.fn(),
  setStockTracking: vi.fn(),
  setStockCount: vi.fn(),
  adjustStock: vi.fn(),
  setStockThreshold: vi.fn(),
}))

import { LowStockScreen } from "../LowStockScreen"

function row(over: Partial<LowStockRowDTO> = {}): LowStockRowDTO {
  return {
    productId: "p1",
    name: "Barossa Free-Range Eggs 700g",
    sku: "EGG-700",
    onHand: 2,
    effectiveThreshold: 5,
    severity: "low",
    ...over,
  } as LowStockRowDTO
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

/** US3 (T031) — the restock queue lists exactly the flagged products. */
describe("restock queue", () => {
  it("lists exactly the rows the server flagged, and invents none", async () => {
    getStockSettings.mockResolvedValue({ defaultThreshold: 5 })
    getLowStock.mockResolvedValue([
      row({ productId: "a", name: "Eggs" }),
      row({ productId: "b", name: "Cream", severity: "out", onHand: 0 }),
    ])

    wrap(<LowStockScreen />)

    expect(await screen.findByText("Eggs")).toBeInTheDocument()
    expect(screen.getByText("Cream")).toBeInTheDocument()
    expect(screen.getAllByRole("row")).toHaveLength(3) // header + 2
  })

  /**
   * ⚠ THE SUMMARY IS COUNTED FROM THE ROWS, never a second figure the server sends separately. 027's
   * rule: "a counter and the rows can disagree, and then nobody knows which is true."
   */
  it("summarises out-of-stock separately from running-low, counted from the rows", async () => {
    getStockSettings.mockResolvedValue({ defaultThreshold: 5 })
    getLowStock.mockResolvedValue([
      row({ productId: "a", severity: "out", onHand: 0 }),
      row({ productId: "b", severity: "out", onHand: 0 }),
      row({ productId: "c", severity: "low" }),
    ])

    wrap(<LowStockScreen />)

    expect(
      await screen.findByText((_, el) => el?.textContent?.trim() === "2 out of stock · 1 running low"),
    ).toBeInTheDocument()
  })

  /**
   * ⚠ SEVERITY IS CARRIED BY WORDS AND WEIGHT, NEVER A HUE (Principle V, research R3). The imported
   * mockup used amber here. A shop floor in bright light is the worst place to depend on a tint, and
   * 041 already removed amber from this very screen.
   */
  it("distinguishes out-of-stock from low without using colour", async () => {
    getStockSettings.mockResolvedValue({ defaultThreshold: 5 })
    getLowStock.mockResolvedValue([
      row({ productId: "a", severity: "out", onHand: 0 }),
      row({ productId: "b", severity: "low" }),
    ])

    wrap(<LowStockScreen />)

    const out = await screen.findByText("Out of stock")
    expect(out.className).toContain("font-semibold")
    expect(screen.getByText("Low").className).not.toContain("font-semibold")

    // No hue class anywhere in the table.
    const html = document.body.innerHTML
    expect(html).not.toMatch(/text-(amber|yellow|orange|red|green)-/)
  })

  it("says nothing needs restocking rather than showing an empty table", async () => {
    getStockSettings.mockResolvedValue({ defaultThreshold: null })
    getLowStock.mockResolvedValue([])

    wrap(<LowStockScreen />)

    expect(await screen.findByText(/nothing needs restocking right now/i)).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
