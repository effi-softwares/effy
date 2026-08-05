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
    render(<OtpInput aria-label="One-time code" variant="cells" defaultValue="" />)
    const field = screen.getByLabelText("One-time code") as HTMLInputElement
    expect(field.style.getPropertyValue("--otp-n")).toBe(String(OTP_LENGTH))
  })
})
