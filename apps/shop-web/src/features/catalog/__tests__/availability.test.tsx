import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ShopAvailabilityDTO, ShopAvailabilityRowDTO } from "@effy/shared-types"

import { onePage, renderList } from "@/test/renderList"
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
  ...onePage(items),
  counts: { needsLook: items.length, outOfStock: 1, lowStock: 0, offSale: 0, all: 9 },
})

const wrap = () => renderList(AvailabilityScreen, "/catalog/availability")
/** The view the screen last asked the server for (103: it travels as the list's query string). */
const lastAsked = () => new URLSearchParams(String(get.mock.lastCall?.[0] ?? "").split("?")[1])

beforeEach(() => vi.clearAllMocks())

describe("Availability (099)", () => {
  it("opens on the sizes that need a look, with each view's count", async () => {
    get.mockResolvedValue(page([row()]))
    wrap()
    expect(await screen.findByText("Out of stock", { selector: "[data-slot=badge]" })).toBeInTheDocument()
    // "Needs a look" is the list's default view: it is not spelled out, and the server opens on it too.
    expect(lastAsked().get("filter")).toBeNull()
    await userEvent.click(screen.getByRole("combobox", { name: "Show" }))
    expect(screen.getByRole("option", { name: /Everything/ })).toHaveTextContent("9")
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
    await userEvent.click(await screen.findByRole("combobox", { name: "Show" }))
    await userEvent.click(screen.getByRole("option", { name: /Off sale/ }))
    await waitFor(() => expect(lastAsked().get("filter")).toBe("off_sale"))
  })
})
