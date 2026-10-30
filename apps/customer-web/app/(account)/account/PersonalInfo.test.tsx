import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { updateProfile } = vi.hoisted(() => ({ updateProfile: vi.fn() }))
vi.mock("./actions", () => ({ updateProfile }))

import { PersonalInfo } from "./PersonalInfo"

/**
 * The per-field editing model: no inputs at rest, a changed value cannot be discarded silently, and
 * email visibly says why it cannot be edited.
 */

const props = {
  givenName: "Janith",
  familyName: "Madarasinghe",
  phone: null,
  email: "shopper@example.com",
}

beforeEach(() => {
  vi.clearAllMocks()
  updateProfile.mockResolvedValue({ ok: true, customer: {} })
  vi.spyOn(window, "confirm").mockReturnValue(true)
})

describe("PersonalInfo - the screen at rest (FR-011)", () => {
  it("shows current values as rows and NO input fields", () => {
    render(<PersonalInfo {...props} />)

    expect(screen.getByTestId("row-name")).toHaveTextContent("Janith Madarasinghe")
    expect(screen.getByTestId("row-phone")).toHaveTextContent("Not set")
    // Nothing on this screen is an entry surface.
    expect(document.querySelectorAll("input")).toHaveLength(0)
  })

  /** A row that does nothing reads as broken, so it says why. */
  it("explains that email cannot be changed rather than doing nothing", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    // It says so on the row itself.
    expect(screen.getByTestId("row-email")).toContainElement(screen.getByTestId("email-locked-note"))
    await user.click(screen.getByTestId("row-email"))
    expect(screen.queryByTestId("field-editor-input")).not.toBeInTheDocument()
  })

  /** The phone is self-asserted and never verified, so it carries no confirmation mark. */
  it("shows the phone with no verified indicator", () => {
    render(<PersonalInfo {...props} phone="0400 000 000" />)

    const row = screen.getByTestId("row-phone")
    expect(row).toHaveTextContent("0400 000 000")
    expect(row.textContent?.toLowerCase()).not.toContain("verified")
    expect(row.querySelector("svg[data-verified]")).toBeNull()
  })
})

describe("PersonalInfo - the editor (FR-012 … FR-021)", () => {
  it("opens one field, pre-filled, and saves it", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("edit-name"))

    const input = await screen.findByTestId("field-editor-input")
    expect(input).toHaveValue("Janith")

    await user.clear(input)
    await user.type(input, "Jan")
    await user.click(screen.getByTestId("field-editor-save"))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ givenName: "Jan", familyName: "Madarasinghe" }),
      ),
    )
  })

  /** A changed value never vanishes silently: Cancel goes through the same guard as Escape and a backdrop click. */
  it("asks before discarding a CHANGED value", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("edit-name"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.type(input, "Something else")

    await user.click(screen.getByTestId("field-editor-cancel"))

    expect(window.confirm).toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  /** And confirming a no-op edit is its own annoyance. */
  it("does NOT prompt when nothing changed", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("edit-name"))
    await screen.findByTestId("field-editor-input")

    await user.click(screen.getByTestId("field-editor-cancel"))

    expect(window.confirm).not.toHaveBeenCalled()
  })

  /** A network hiccup must not lose what was typed. */
  it("keeps the editor open and the typed value intact when the save fails", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({ ok: false, error: "We couldn't save that." })
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("edit-name"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.type(input, "Jan")
    await user.click(screen.getByTestId("field-editor-save"))

    expect(await screen.findByTestId("field-editor-error")).toHaveTextContent(
      "We couldn't save that.",
    )
    expect(screen.getByTestId("field-editor-input")).toHaveValue("Jan")
  })

  /** `""` clears, never `null`: the mobile client drops nulls, so an empty string is the only "clear this". */
  it("clears a phone by sending an empty string, not null", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} phone="0400 000 000" />)

    await user.click(screen.getByTestId("edit-phone"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.click(screen.getByTestId("field-editor-save"))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ phone: "" })),
    )
  })
})
