import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OTP_LENGTH, OtpInput } from "@effy/design-system/ui"

/**
 * 036 T014 — the shared one-time-code field, and the invariants the two out-of-scope consoles rely on.
 *
 * ⚠ IT LIVES HERE, NOT IN `packages/design-system`. That package has no test runner by design — its
 * `test` script is zero-dependency node check-scripts, and its generator is "proudly zero-dep".
 * Adding vitest there to cover one component would be new infrastructure out of proportion to the
 * problem; this app already has the runner, the DOM and the React alias plumbing, and is the surface
 * that actually consumes the new variant.
 *
 * ⚠ WHAT MATTERS MOST HERE IS THE THING THAT MUST *NOT* CHANGE. `OtpInput` is shared with
 * `packages/web-kit`'s `OtpSignInCard`, which serves `back-office` and `shop-web` — both OUT OF SCOPE
 * for 036 (FR-044a). Their sign-in is the ONLY credential those audiences have; there is no password
 * to fall back on. So the default variant's contract is pinned as hard as the new one's.
 */
describe("OtpInput — the default (plain) variant, which the consoles use", () => {
  it("⚠ keeps `maxLength` so the console tests pass UNMODIFIED", () => {
    // `OtpSignInCard.test.tsx` asserts `maxlength="6"`. 036 drops `maxLength` on the CELLS variant to
    // satisfy FR-004 (no truncation) — but doing that to the default would change two internal
    // consoles this feature is not scoped to touch.
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("maxlength", String(OTP_LENGTH))
  })

  it("offers the numeric keyboard and OS autofill", () => {
    // These two attributes are the entire reason a shopper can tap the code from a notification
    // instead of retyping it.
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    const field = screen.getByLabelText("One-time code")
    expect(field).toHaveAttribute("inputmode", "numeric")
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
  })

  it("⚠ never becomes `type=number`", () => {
    // A number input strips leading zeros, exposes spinners and accepts "1e5". Roughly one code in ten
    // begins with a zero, so that would lock out ~10% of sign-ins.
    render(<OtpInput aria-label="One-time code" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("type", "text")
  })
})

describe("OtpInput — the cells variant (036 FR-002, FR-004)", () => {
  it("⚠ is still ONE input, not six boxes", () => {
    // THE INVARIANT THE WHOLE COMPONENT EXISTS TO HOLD. Segmented per-digit widgets are several inputs
    // wearing a costume, and they are how screen-reader users lose their place in an OTP form. The
    // cells are painted BEHIND one field; `getAllByLabelText` must still return exactly one node —
    // which is also what `OtpSignInCard.test.tsx:121` and `e2e/otp-entry.spec.ts` assert.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getAllByLabelText("One-time code")).toHaveLength(1)
  })

  it("⚠ DROPS `maxLength`, because truncation is the defect this feature exists to fix", () => {
    // A native `maxLength` silently discards the 7th and 8th characters of a paste. On this platform
    // that is exactly wrong: a code that is not six digits did not come from us, and the shopper needs
    // to SEE that rather than have it quietly reshaped into something submittable (FR-004).
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).not.toHaveAttribute("maxlength")
  })

  it("⚠ pins the field to LTR — the cell geometry is direction-physical", () => {
    // The underlines are drawn with `to right` and `background-position: 0 100%`. Under `dir="rtl"`
    // they would land beneath the wrong characters. A numeric code is LTR content regardless.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    expect(screen.getByLabelText("One-time code")).toHaveAttribute("dir", "ltr")
  })

  it("keeps the autofill token and numeric keyboard", () => {
    // ⚠ The cells must not cost the behaviour that matters most. Autofill beats presentation.
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    const field = screen.getByLabelText("One-time code")
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
    expect(field).toHaveAttribute("inputmode", "numeric")
  })

  it("⚠ declares six cells from the shared constant, not a literal", () => {
    // FR-045 — "six" has one definition per platform. Before 036 this file carried a bare `6` and
    // three mobile files carried a hardcoded "6-digit code" string: four places to change, and no way
    // to know if you missed one.
    //
    // ⚠ 044 REWROTE THIS ASSERTION, DELIBERATELY. It used to read the `--otp-n` custom property off
    // the input's inline style, because 036 painted the positions as a background gradient sized in
    // `ch` units. 044 replaced that mechanism (it was invisible, off-centre, and half-size above
    // 768px — see BASELINE.md), so the property no longer exists and an assertion about it would be
    // asserting the absence of a bug that is no longer possible. The requirement is unchanged; what
    // it is measured against is now the thing a person actually sees: six boxes.
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
    // The native caret is transparent — the whole point of the overlay — so SOMETHING has to say
    // where typing will go. Before 044 nothing did.
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
    // A refusal the shopper has to read to notice is a refusal they will retype into.
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
    // Six positions can only display six characters, so an eight-digit paste rendered as cells would
    // LOOK like a six-digit code — visually reproducing the exact truncation FR-004 forbids. The
    // shape change IS the signal (C-11).
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
