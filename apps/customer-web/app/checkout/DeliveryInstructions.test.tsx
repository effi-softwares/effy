import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { EMPTY_DRAFT, type InstructionsDraft } from "@/lib/delivery-instructions"

import { DeliveryInstructions } from "./DeliveryInstructions"

/** The control is controlled; this is the smallest parent that makes it behave like checkout. */
function Harness({ initial = EMPTY_DRAFT, onDraft }: { initial?: InstructionsDraft; onDraft?: (d: InstructionsDraft) => void }) {
  const [draft, setDraft] = useState(initial)
  return (
    <DeliveryInstructions
      value={draft}
      onChange={(next) => {
        setDraft(next)
        onDraft?.(next)
      }}
    />
  )
}

describe("066 — the checkout delivery-instructions control", () => {
  it("offers both handover choices, neither chosen", () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: "Leave at the door" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Meet at the door" })).toHaveAttribute("aria-pressed", "false")
  })

  it("choosing one unchooses the other", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Leave at the door" }))
    await user.click(screen.getByRole("button", { name: "Meet at the door" }))
    expect(screen.getByRole("button", { name: "Leave at the door" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Meet at the door" })).toHaveAttribute("aria-pressed", "true")
  })

  /** "No preference" is a real answer — a radio group, once touched, has no way back to it. */
  it("⚠ a choice can be switched off again", async () => {
    const user = userEvent.setup()
    let last: InstructionsDraft = EMPTY_DRAFT
    render(<Harness onDraft={(d) => (last = d)} />)
    await user.click(screen.getByRole("button", { name: "Leave at the door" }))
    expect(last.handover).toBe("leave_at_door")
    await user.click(screen.getByRole("button", { name: "Leave at the door" }))
    expect(last.handover).toBeNull()
  })

  it("shows how many characters are left as the shopper types", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText("250 characters left")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Note for the driver"), "Side gate")
    expect(screen.getByText("241 characters left")).toBeInTheDocument()
  })

  /** FR-004 — typing stops at the limit; nothing longer can be submitted from this control. */
  it("⚠ stops at 250 characters, counted as a person counts them", async () => {
    const user = userEvent.setup()
    let last: InstructionsDraft = EMPTY_DRAFT
    render(<Harness initial={{ handover: null, note: "x".repeat(249) }} onDraft={(d) => (last = d)} />)
    const field = screen.getByLabelText("Note for the driver")
    await user.click(field)
    await user.paste("🚪")
    expect(screen.getByText("0 characters left")).toBeInTheDocument()
    await user.paste("overflow")
    expect(Array.from(last.note)).toHaveLength(250)
    expect(last.note.endsWith("🚪")).toBe(true)
  })

  /**
   * ⚠ SC-006. The note is customer-authored text. It must come back as the characters typed — no
   * element created, nothing linked, nothing run.
   */
  it("⚠ markup typed into the note stays text", () => {
    const hostile = '<b>bold</b> <a href="https://example.com">link</a> <img src=x onerror=alert(1)> <script>alert(1)</script>'
    const { container } = render(<Harness initial={{ handover: null, note: hostile }} />)
    expect(screen.getByLabelText("Note for the driver")).toHaveValue(hostile)
    expect(container.querySelector("b, a, img, script")).toBeNull()
  })

  it("is announced: the choices are a labelled group and the count is polite", () => {
    render(<Harness />)
    expect(screen.getByRole("group", { name: /hand it over/i })).toBeInTheDocument()
    expect(screen.getByText("250 characters left")).toHaveAttribute("aria-live", "polite")
  })
})
