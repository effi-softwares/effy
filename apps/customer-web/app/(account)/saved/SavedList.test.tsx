import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedItemDTO } from "@effy/shared-types"

vi.mock("@/app/(shop)/_components/ListChooser", () => ({ openListChooser: vi.fn() }))

import { addToCart, clearCart, DEFAULT_PACKAGE_KEY } from "@/lib/cart-store"

import { SavedList } from "./SavedList"

const WEEKLY = "5d1e0000-0000-0000-0000-000000000005"

const item = (id: string, name: string, over: Partial<SavedItemDTO> = {}): SavedItemDTO => ({
  id,
  name,
  brand: null,
  imageUrl: null,
  priceAmount: "6.50",
  currency: "AUD",
  compareAtAmount: null,
  badges: [],
  savedAt: `2026-10-0${id}T00:00:00Z`,
  savedPriceAmount: "6.50",
  verdict: "purchasable",
  ...over,
})

const eggs = item("3", "Eggs")
const milk = item("2", "Milk")
const tea = item("1", "Tea", { verdict: "temporarily_unavailable" })

function platform() {
  const calls: { key: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ key: `${init?.method ?? "GET"} ${url}`, body: init?.body ? JSON.parse(init.body as string) : undefined })
      if (url.endsWith("/add-to-cart")) {
        return { ok: true, status: 200, json: async () => ({ added: ["3", "2"], skipped: [{ productId: "1", reason: "temporarily_unavailable" }] }) }
      }
      if (url === "/api/saved/ids") return { ok: true, status: 200, json: async () => ({ productIds: [], namedProductIds: [] }) }
      if (url === "/api/cart" || url.startsWith("/api/cart")) return { ok: false, status: 401, json: async () => ({}) }
      return { ok: true, status: 204, json: async () => undefined }
    }),
  )
  return calls
}

describe("068 — one list's page", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    clearCart()
  })
  afterEach(() => vi.unstubAllGlobals())

  /** FR-028: the weekly-shop action is scoped to the list on screen. */
  it("add-all posts to THIS list and names what was left out", async () => {
    const calls = platform()
    render(<SavedList initial={[eggs, milk, tea]} listId={WEEKLY} />)

    await userEvent.click(screen.getByRole("button", { name: "Add everything available to cart" }))

    expect(await screen.findByText("2 items added to your cart.")).toBeInTheDocument()
    expect(calls.some((c) => c.key === `POST /api/lists/${WEEKLY}/add-to-cart`)).toBe(true)
    expect(calls.some((c) => c.key === "POST /api/saved/add-to-cart")).toBe(false)
    expect(screen.getByText(/Tea —/)).toBeInTheDocument()
    // FR-029: nothing leaves the list.
    expect(screen.getAllByRole("listitem").filter((li) => within(li).queryByRole("link"))).toHaveLength(3)
  })

  it("offers no add-all when nothing in the list can be bought", () => {
    platform()
    render(<SavedList initial={[tea]} listId={WEEKLY} />)
    expect(screen.queryByRole("button", { name: "Add everything available to cart" })).toBeNull()
  })

  /** 033 FR-050a, on every list: a second "Add to cart" would raise the quantity. */
  it("says a row is already in the cart, and how many, instead of offering to add it again", () => {
    platform()
    addToCart({ productId: "3", name: "Eggs", imageUrl: null, unitPriceAmount: "6.50", currency: "AUD", quantity: 2, packageKey: DEFAULT_PACKAGE_KEY })
    render(<SavedList initial={[eggs, milk]} listId={WEEKLY} />)

    expect(screen.getByRole("link", { name: "2 in your cart" })).toHaveAttribute("href", "/cart")
    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(1)
  })

  /** FR-024: remove is scoped to this list, and undo restores the position it held. */
  it("removes from this list only, and undo puts the row back where it was", async () => {
    const calls = platform()
    render(<SavedList initial={[eggs, milk, tea]} listId={WEEKLY} />)

    await userEvent.click(screen.getByRole("button", { name: "Remove Milk from this list" }))

    await waitFor(() => expect(calls.some((c) => c.key === `DELETE /api/lists/${WEEKLY}/entries/2`)).toBe(true))
    expect(calls.some((c) => c.key.startsWith("DELETE /api/saved/"))).toBe(false)
    expect(screen.queryByRole("link", { name: "Milk" })).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Undo" }))

    const names = screen.getAllByRole("link").map((a) => a.textContent)
    expect(names).toEqual(["Eggs", "Milk", "Tea"])
    await waitFor(() =>
      expect(calls.find((c) => c.key === `PUT /api/lists/${WEEKLY}/entries/2`)?.body).toEqual({ restoreAddedAt: milk.savedAt }),
    )
  })

  /** FR-026: an empty named list must not read as "you have saved nothing". */
  it("an empty named list says the LIST is empty", () => {
    platform()
    render(<SavedList initial={[]} listId={WEEKLY} />)
    expect(screen.getByText("This list is empty")).toBeInTheDocument()
    expect(screen.queryByText("Nothing saved yet")).toBeNull()
  })

  it("an empty Saved list keeps its own message", () => {
    platform()
    render(<SavedList initial={[]} />)
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument()
  })
})
