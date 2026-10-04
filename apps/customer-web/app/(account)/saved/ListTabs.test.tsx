import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedListDTO } from "@effy/shared-types"

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))

import { deleteSummary, ListTabs } from "./ListTabs"

const WEEKLY = "5d1e0000-0000-0000-0000-000000000005"
const saved: SavedListDTO = { id: "default", isDefault: true, name: null, count: 12, onlyHereCount: 9 }
const weekly: SavedListDTO = { id: WEEKLY, isDefault: false, name: "Weekly Items", count: 5, onlyHereCount: 2 }

describe("068 — the lists tab row", () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "")
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open")
    }
  })
  beforeEach(() => {
    push.mockReset()
    refresh.mockReset()
    window.localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("lists Saved first, each with its count, and marks the current one", () => {
    render(<ListTabs lists={[saved, weekly]} currentId={WEEKLY} />)
    const links = within(screen.getByRole("navigation", { name: "Your lists" })).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual(["Saved (12)", "Weekly Items (5)"])
    expect(links[0]).toHaveAttribute("href", "/saved")
    expect(links[1]).toHaveAttribute("href", `/saved/${WEEKLY}`)
    expect(links[1]).toHaveAttribute("aria-current", "page")
  })

  /** FR-003: "Saved" cannot be renamed or deleted, so neither is offered. */
  it("offers neither rename nor delete on Saved", () => {
    render(<ListTabs lists={[saved, weekly]} currentId="default" />)
    expect(screen.queryByRole("button", { name: "Rename list" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete list" })).toBeNull()
    expect(screen.getByRole("button", { name: "New list" })).toBeInTheDocument()
  })

  /** FR-006: both numbers, before anything is deleted. */
  it("states what a delete costs before doing it", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<ListTabs lists={[saved, weekly]} currentId={WEEKLY} />)

    await userEvent.click(screen.getAllByRole("button", { name: "Delete list" })[0])

    expect(
      screen.getByText("This list has 5 items. 2 of them aren't in any other list and will no longer be saved."),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("deletes on confirmation and returns to Saved", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? { ok: true, status: 204, json: async () => undefined }
        : { ok: true, status: 200, json: async () => ({ productIds: [], namedProductIds: [] }) },
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<ListTabs lists={[saved, weekly]} currentId={WEEKLY} />)

    await userEvent.click(screen.getAllByRole("button", { name: "Delete list" })[0])
    await userEvent.click(within(screen.getByRole("dialog", { name: /Delete/ })).getByRole("button", { name: "Delete list" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/saved"))
    expect(fetchMock).toHaveBeenCalledWith(`/api/lists/${WEEKLY}`, { method: "DELETE" })
  })

  it("shows a taken name on the rename field and keeps what was typed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "x", reason: "name_taken" }) })),
    )
    render(<ListTabs lists={[saved, weekly]} currentId={WEEKLY} />)

    await userEvent.click(screen.getByRole("button", { name: "Rename list" }))
    const dialog = screen.getByRole("dialog", { name: "Rename list" })
    const field = within(dialog).getByLabelText("Name")
    expect(field).toHaveValue("Weekly Items")
    await userEvent.clear(field)
    await userEvent.type(field, "Daily Items")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await within(dialog).findByText("You already have a list with that name.")).toBeInTheDocument()
    expect(field).toHaveValue("Daily Items")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("creates a list and opens it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ ...weekly, count: 0, onlyHereCount: 0 }) })),
    )
    render(<ListTabs lists={[saved]} currentId="default" />)

    await userEvent.click(screen.getByRole("button", { name: "New list" }))
    const dialog = screen.getByRole("dialog", { name: "New list" })
    await userEvent.type(within(dialog).getByLabelText("Name"), "Weekly Items")
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/saved/${WEEKLY}`))
  })
})

describe("deleteSummary", () => {
  it.each([
    [{ count: 0, onlyHereCount: 0 }, "This list is empty."],
    [{ count: 1, onlyHereCount: 0 }, "This list has 1 item. All of them are in another list too, so they stay saved."],
    [{ count: 3, onlyHereCount: 1 }, "This list has 3 items. 1 of them isn't in any other list and will no longer be saved."],
    [{ count: 3, onlyHereCount: 3 }, "This list has 3 items. 3 of them aren't in any other list and will no longer be saved."],
  ])("%o", (list, sentence) => {
    expect(deleteSummary(list)).toBe(sentence)
  })
})
