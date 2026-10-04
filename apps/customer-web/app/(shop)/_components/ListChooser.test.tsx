import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedListDTO } from "@effy/shared-types"

import { ListChooser } from "./ListChooser"

const PRODUCT = "9f2c1d4e-0000-0000-0000-000000000001"
const WEEKLY = "5d1e0000-0000-0000-0000-000000000005"

const saved: SavedListDTO = { id: "default", isDefault: true, name: null, count: 3, onlyHereCount: 2, containsProduct: true }
const weekly: SavedListDTO = { id: WEEKLY, isDefault: false, name: "Weekly Items", count: 5, onlyHereCount: 2, containsProduct: false }

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body })
const refused = (status: number, reason?: string) => ({ ok: false, status, json: async () => ({ error: "x", reason }) })

/** Routes each request by method + path, so a test states the platform's answers and nothing else. */
function platform(answers: Record<string, unknown>) {
  const calls: { key: string; body?: unknown }[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`
    calls.push({ key, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const answer = answers[key]
    if (answer === undefined) throw new Error(`unexpected request: ${key}`)
    return typeof answer === "function" ? (answer as () => unknown)() : answer
  })
  vi.stubGlobal("fetch", fetchMock)
  return calls
}

const LISTS = `GET /api/lists?productId=${PRODUCT}`
const IDS = "GET /api/saved/ids"

describe("068 — the list chooser", () => {
  beforeAll(() => {
    // jsdom has no modal dialog. `open` is what makes the contents reachable by role.
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "")
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open")
      this.dispatchEvent(new Event("close"))
    }
  })
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it("shows every list, Saved first, each ticked or not", async () => {
    platform({ [LISTS]: ok([saved, weekly]) })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    const boxes = await screen.findAllByRole("checkbox")
    expect(boxes).toHaveLength(2)
    expect(screen.getByRole("checkbox", { name: /^Saved/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /^Weekly Items/ })).not.toBeChecked()
  })

  it("ticking a list sends one add for that list", async () => {
    let lists = [saved, weekly]
    const calls = platform({
      [LISTS]: () => ok(lists),
      [`PUT /api/lists/${WEEKLY}/entries/${PRODUCT}`]: () => {
        lists = [saved, { ...weekly, containsProduct: true, count: 6 }]
        return ok(undefined, 204)
      },
      [IDS]: ok({ productIds: [PRODUCT], count: 1, namedProductIds: [PRODUCT] }),
    })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    await userEvent.click(await screen.findByRole("checkbox", { name: /^Weekly Items/ }))

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /^Weekly Items/ })).toBeChecked())
    expect(calls.filter((c) => c.key.startsWith("PUT "))).toHaveLength(1)
  })

  it("unticking takes the product out of that list only", async () => {
    const calls = platform({
      [LISTS]: ok([saved, { ...weekly, containsProduct: true }]),
      [`DELETE /api/lists/${WEEKLY}/entries/${PRODUCT}`]: ok(undefined, 204),
      [IDS]: ok({ productIds: [PRODUCT], count: 1, namedProductIds: [] }),
    })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    await userEvent.click(await screen.findByRole("checkbox", { name: /^Weekly Items/ }))

    await waitFor(() => expect(calls.some((c) => c.key === `DELETE /api/lists/${WEEKLY}/entries/${PRODUCT}`)).toBe(true))
    expect(calls.some((c) => c.key.includes("/api/lists/default/entries"))).toBe(false)
  })

  it("a new list is created and the product placed in it in ONE request", async () => {
    const calls = platform({
      [LISTS]: ok([saved]),
      "POST /api/lists": ok({ ...weekly, name: "Daily Items", containsProduct: undefined }, 201),
      [IDS]: ok({ productIds: [PRODUCT], count: 1, namedProductIds: [PRODUCT] }),
    })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    await userEvent.type(await screen.findByLabelText("New list"), "Daily Items")
    await userEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/lists")).toBe(true))
    expect(calls.find((c) => c.key === "POST /api/lists")?.body).toEqual({ name: "Daily Items", productId: PRODUCT })
    expect(calls.some((c) => c.key.startsWith("PUT "))).toBe(false)
  })

  it.each([
    ["name_taken", 409, "You already have a list with that name."],
    ["invalid_name", 400, "A list name needs 1 to 40 characters."],
    ["list_limit", 400, "You've reached the maximum number of lists. Delete one to make another."],
  ])("says why a create was refused: %s", async (reason, status, sentence) => {
    platform({ [LISTS]: ok([saved]), "POST /api/lists": refused(status, reason) })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    await userEvent.type(await screen.findByLabelText("New list"), "Weekly Items")
    await userEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(await screen.findByText(sentence)).toBeInTheDocument()
    expect(screen.getByLabelText("New list")).toHaveValue("Weekly Items") // what they typed is kept
  })

  it("counts the name in characters as the platform does, and stops an over-long one", async () => {
    platform({ [LISTS]: ok([saved]) })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    const field = await screen.findByLabelText("New list")
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled() // nothing typed
    await userEvent.type(field, "🥚".repeat(40))
    expect(screen.getByText("0 characters left")).toBeInTheDocument() // 40 emoji are 40, not 80
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled()
    await userEvent.type(field, "x")
    expect(screen.getByText("1 too many characters")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled()
  })

  /** FR-010: a name is the shopper's own text and is never interpreted. */
  it("renders a name that looks like markup as the characters typed", async () => {
    const hostile = `<img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a>`
    platform({ [LISTS]: ok([saved, { ...weekly, name: hostile }]) })
    const { container } = render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    expect(await screen.findByText(hostile)).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("a[href^='javascript']")).toBeNull()
  })

  /** FR-037: named lists need an account; the save the guest just made is not lost. */
  it("tells a guest that lists need an account and offers sign-in", async () => {
    platform({ [LISTS]: refused(401) })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    expect(await screen.findByText(/need an account/)).toBeInTheDocument()
    expect(screen.getByText(/saved on this device/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringMatching(/^\/sign-in\?next=/))
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("says so when a list was deleted on another device, and places the product nowhere", async () => {
    let lists = [saved, weekly]
    const calls = platform({
      [LISTS]: () => ok(lists),
      [`PUT /api/lists/${WEEKLY}/entries/${PRODUCT}`]: () => {
        lists = [saved]
        return refused(404, "list_not_found")
      },
    })
    render(<ListChooser productId={PRODUCT} onClosed={() => {}} />)

    await userEvent.click(await screen.findByRole("checkbox", { name: /^Weekly Items/ }))

    expect(await screen.findByText("That list no longer exists.")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: /^Weekly Items/ })).toBeNull())
    expect(calls.filter((c) => c.key.startsWith("PUT "))).toHaveLength(1)
  })

  it("tells its opener when it closes", async () => {
    platform({ [LISTS]: ok([saved]) })
    const onClosed = vi.fn()
    render(<ListChooser productId={PRODUCT} onClosed={onClosed} />)

    await userEvent.click(await screen.findByRole("button", { name: "Done" }))
    expect(onClosed).toHaveBeenCalledOnce()
  })
})
