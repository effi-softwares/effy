import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ShopAvailabilityDTO, ShopAvailabilityRowDTO } from "@effy/shared-types"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}))
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))

const get = vi.hoisted(() => vi.fn())
vi.mock("@/lib/api", () => ({ api: { get } }))
const setVariantState = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({ setVariantState }))

const { AvailabilityScreen } = await import("../AvailabilityScreen")

const row = (over: Partial<ShopAvailabilityRowDTO> = {}): ShopAvailabilityRowDTO => ({
  productId: "p1",
  productName: "Sourdough loaf",
  brand: null,
  productStatus: "active",
  variantId: "v1",
  label: "800 g",
  code: "V2345AB",
  sku: "BRD-0042",
  gtin: null,
  onSale: true,
  lastOnSale: false,
  stock: {
    productId: "p1",
    variantId: "v1",
    tracked: true,
    onHand: 0,
    threshold: null,
    effectiveThreshold: 5,
    outOfStock: true,
    low: false,
  },
  imageUrl: null,
  ...over,
})

const page = (items: ShopAvailabilityRowDTO[]): ShopAvailabilityDTO => ({
  items,
  next: null,
  counts: { needsLook: items.length, outOfStock: 1, lowStock: 0, offSale: 0, all: 9 },
})

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AvailabilityScreen />
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe("Availability (099)", () => {
  it("opens on the sizes that need a look, with each view's count", async () => {
    get.mockResolvedValue(page([row()]))
    wrap()
    expect(await screen.findByText("Out of stock", { selector: ".ef-st" })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith("/shop/v1/availability?filter=needs_look")
    expect(screen.getByRole("tab", { name: /Everything/ })).toHaveTextContent("9")
  })

  it("takes a size off sale in one tap, through the product's own route", async () => {
    get.mockResolvedValue(page([row()]))
    setVariantState.mockResolvedValue({})
    wrap()
    await userEvent.click(await screen.findByRole("switch", { name: "Sourdough loaf · 800 g on sale" }))
    await waitFor(() => expect(setVariantState).toHaveBeenCalledWith("p1", "v1", { state: "inactive" }))
  })

  it("refuses to switch off the last size on sale, and says why", async () => {
    get.mockResolvedValue(page([row({ lastOnSale: true })]))
    wrap()
    expect(await screen.findByRole("switch", { name: /on sale/ })).toBeDisabled()
    expect(screen.getByText(/make the product unavailable instead/)).toBeInTheDocument()
  })

  it("asks the server for the chosen view", async () => {
    get.mockResolvedValue(page([row()]))
    wrap()
    await userEvent.click(await screen.findByRole("tab", { name: /Off sale/ }))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/shop/v1/availability?filter=off_sale"))
  })
})
