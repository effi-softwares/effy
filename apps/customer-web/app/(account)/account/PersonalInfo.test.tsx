import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { updateProfile } = vi.hoisted(() => ({ updateProfile: vi.fn() }))
vi.mock("./actions", () => ({ updateProfile }))

import { PersonalInfo } from "./PersonalInfo"

/**
 * 034 US1 — the per-field editing model on the web surface.
 *
 * These assert the three things the design turns on and that a refactor could silently undo: the
 * screen holds no inputs at rest, a changed value cannot be discarded silently, and email is visibly
 * not editable rather than inertly ignoring a click.
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

describe("PersonalInfo — the screen at rest (FR-011)", () => {
  it("shows current values as rows and NO input fields", () => {
    render(<PersonalInfo {...props} />)

    expect(screen.getByTestId("row-given-name")).toHaveTextContent("Janith")
    expect(screen.getByTestId("row-phone")).toHaveTextContent("Not set")
    // The whole point of the redesign: nothing on this screen is an entry surface.
    expect(document.querySelectorAll("input")).toHaveLength(0)
  })

  /**
   * ⚠ FR-022. A row that silently does nothing is indistinguishable from a broken one — the customer
   * taps twice and then reports a bug. It must SAY why.
   */
  it("explains that email cannot be changed rather than doing nothing", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("row-email"))

    expect(screen.getByTestId("email-locked-note")).toBeInTheDocument()
    expect(screen.queryByTestId("field-editor-input")).not.toBeInTheDocument()
  })

  /**
   * ⚠ FR-060a. The phone is self-asserted and never verified by this feature, so it must carry no
   * confirmation indicator — a tick would be a claim the platform cannot support, and one the
   * customer would reasonably rely on.
   */
  it("shows the phone with no verified indicator", () => {
    render(<PersonalInfo {...props} phone="0400 000 000" />)

    const row = screen.getByTestId("row-phone")
    expect(row).toHaveTextContent("0400 000 000")
    expect(row.textContent?.toLowerCase()).not.toContain("verified")
    expect(row.querySelector("svg[data-verified]")).toBeNull()
  })
})

describe("PersonalInfo — the editor (FR-012 … FR-021)", () => {
  it("opens one field, pre-filled, and saves it", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("row-given-name"))

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

  /**
   * ⚠ THE ONE THAT MATTERS (FR-018 / SC-003).
   *
   * A changed value must never vanish silently. Cancel goes through the same guard every other
   * dismissal route does, so this also covers Escape and a backdrop click.
   */
  it("asks before discarding a CHANGED value", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("row-given-name"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.type(input, "Something else")

    await user.click(screen.getByTestId("field-editor-cancel"))

    expect(window.confirm).toHaveBeenCalled()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  /** ⚠ FR-019 — and the converse matters too: confirming a no-op edit is its own annoyance. */
  it("does NOT prompt when nothing changed", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("row-given-name"))
    await screen.findByTestId("field-editor-input")

    await user.click(screen.getByTestId("field-editor-cancel"))

    expect(window.confirm).not.toHaveBeenCalled()
  })

  /** FR-021 — losing what someone just typed because the network hiccuped is the worst form bug. */
  it("keeps the editor open and the typed value intact when the save fails", async () => {
    const user = userEvent.setup()
    updateProfile.mockResolvedValue({ ok: false, error: "We couldn't save that." })
    render(<PersonalInfo {...props} />)

    await user.click(screen.getByTestId("row-given-name"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.type(input, "Jan")
    await user.click(screen.getByTestId("field-editor-save"))

    expect(await screen.findByTestId("field-editor-error")).toHaveTextContent(
      "We couldn't save that.",
    )
    expect(screen.getByTestId("field-editor-input")).toHaveValue("Jan")
  })

  /**
   * ⚠ `""` clears — never `null`. The mobile client drops nulls from the payload entirely, so an
   * empty string is the only signal that distinguishes "clear this" from "field not sent".
   */
  it("clears a phone by sending an empty string, not null", async () => {
    const user = userEvent.setup()
    render(<PersonalInfo {...props} phone="0400 000 000" />)

    await user.click(screen.getByTestId("row-phone"))
    const input = await screen.findByTestId("field-editor-input")
    await user.clear(input)
    await user.click(screen.getByTestId("field-editor-save"))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ phone: "" })),
    )
  })
})
