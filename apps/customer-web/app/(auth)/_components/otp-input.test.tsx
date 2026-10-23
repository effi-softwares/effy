import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OTP_LENGTH, OtpInput } from "@effy/design-system/ui"

/**
 * The shared one-time-code field, tested here (design-system has no test runner). The default variant's
 * contract is pinned as hard as the cells variant's: it is the consoles' only credential (`OtpSignInCard`).
 */
describe("OtpInput — the default (plain) variant, which the consoles use", () => {
  it("⚠ keeps `maxLength` so the console tests pass UNMODIFIED", () => {
    // The plain variant keeps `maxlength="6"` (`OtpSignInCard.test.tsx`); only the cells variant drops it.
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("maxlength", String(OTP_LENGTH))
  })

  it("offers the numeric keyboard and OS autofill", () => {
    // These two attributes let a shopper tap the code from a notification.
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    const field = screen.getByLabelText("One-time code")
    expect(field).toHaveAttribute("inputmode", "numeric")
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
  })

  it("⚠ never becomes `type=number`", () => {
    // A number input strips leading zeros, shows spinners and accepts "1e5".
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("type", "text")
  })
})

describe("OtpInput — the cells variant (036 FR-002, FR-004)", () => {
  it("⚠ is still ONE input, not six boxes", () => {
    // One field: the cells are painted behind it, and `getAllByLabelText` returns exactly one node.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getAllByLabelText("One-time code")).toHaveLength(1)
  })

  it("⚠ DROPS `maxLength`, because truncation is the defect this feature exists to fix", () => {
    // A native `maxLength` would silently drop the 7th and 8th characters of a paste.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).not.toHaveAttribute("maxlength")
  })

  it("⚠ pins the field to LTR — the cell geometry is direction-physical", () => {
    // A numeric code is LTR content regardless of the page direction.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("dir", "ltr")
  })

  it("keeps the autofill token and numeric keyboard", () => {
    // The cells must not cost autofill.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    const field = screen.getByLabelText("One-time code")
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
    expect(field).toHaveAttribute("inputmode", "numeric")
  })

  it("⚠ declares six cells from the shared constant, not a literal", () => {
    // "Six" has one definition (`OTP_LENGTH`); measured against what a person sees: six boxes.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(document.querySelectorAll('[data-slot="otp-cell"]')).toHaveLength(OTP_LENGTH)
  })
})

describe("OtpInput — the cells variant, rebuilt (044 US1)", () => {
  it("⚠ renders each digit in its own position, in order", () => {
    render(<OtpInput aria-label="One-time code" variant="cells" value="123" onChange={() => {}} />)
    const cells = [...document.querySelectorAll('[data-slot="otp-cell"]')]
    expect(cells.map((c) => c.textContent)).toEqual(["1", "2", "3", "", "", ""])
  })

  it("marks exactly the filled positions as filled", () => {
    render(<OtpInput aria-label="One-time code" variant="cells" value="1234" onChange={() => {}} />)
    const filled = document.querySelectorAll('[data-slot="otp-cell"][data-filled]')
    expect(filled).toHaveLength(4)
  })

  it("⚠ indicates the position the next character lands in (FR-006)", () => {
    // The native caret is transparent, so something has to say where typing will go.
    const { rerender } = render(
      <OtpInput aria-label="One-time code" variant="cells" value="" onChange={() => {}} />,
    )
    expect(document.querySelector('[data-slot="otp-cell"][data-active]')).toHaveAttribute(
      "data-index",
      "0",
    )
    rerender(<OtpInput aria-label="One-time code" variant="cells" value="12" onChange={() => {}} />)
    expect(document.querySelector('[data-slot="otp-cell"][data-active]')).toHaveAttribute(
      "data-index",
      "2",
    )
  })

  it("⚠ clamps the indicator to the last position on a full code, rather than losing it", () => {
    render(<OtpInput aria-label="One-time code" variant="cells" value="123456" onChange={() => {}} />)
    expect(document.querySelector('[data-slot="otp-cell"][data-active]')).toHaveAttribute(
      "data-index",
      String(OTP_LENGTH - 1),
    )
  })

  it("⚠ carries a refusal on the CELLS, not only in the message (FR-007)", () => {
    // A refusal the shopper must read to notice is one they will retype into.
    render(
      <OtpInput
        aria-label="One-time code"
        variant="cells"
        value="123456"
        aria-invalid
        onChange={() => {}}
      />,
    )
    const cells = [...document.querySelectorAll('[data-slot="otp-cell"]')]
    expect(cells).toHaveLength(OTP_LENGTH)
    for (const cell of cells) expect(cell.className).toContain("border-destructive")
  })

  it("⚠ does NOT paint an over-length value as six cells", () => {
    // Six cells show six characters, so an eight-digit paste rendered as cells would look valid; the shape change is the signal.
    render(<OtpInput aria-label="One-time code" variant="cells" value="12345678" onChange={() => {}} />)
    expect(document.querySelectorAll('[data-slot="otp-cell"]')).toHaveLength(0)
    expect(screen.getByLabelText("One-time code")).toHaveValue("12345678")
  })

  it("⚠ the cell layer is scenery — hidden from assistive technology and not clickable", () => {
    render(<OtpInput aria-label="One-time code" variant="cells" value="12" onChange={() => {}} />)
    const layer = document.querySelector('[data-slot="otp-cell"]')!.parentElement!
    expect(layer).toHaveAttribute("aria-hidden")
    expect(layer.className).toContain("pointer-events-none")
    // …and the invariant that follows from it, restated where it can fail:
    expect(screen.getAllByLabelText("One-time code")).toHaveLength(1)
  })

  it("⚠ mirrors an UNCONTROLLED value, so the cells cannot sit empty over a field with text in it", () => {
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="99" />)
    const cells = [...document.querySelectorAll('[data-slot="otp-cell"]')]
    expect(cells.map((c) => c.textContent)).toEqual(["9", "9", "", "", "", ""])
  })

  it("⚠ renders NO cell layer on the plain variant — the consoles must be untouched (SC-011)", () => {
    render(<OtpInput aria-label="One-time code" defaultValue="123" />)
    expect(document.querySelectorAll('[data-slot="otp-cell"]')).toHaveLength(0)
  })
})
