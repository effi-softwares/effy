import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { OTP_LENGTH } from "@effy/design-system/ui"

import { CodeField } from "./CodeField"

const cells = () => [...document.querySelectorAll('[data-slot="otp-cell"]')]

describe("CodeField — the storefront's emailed-code field", () => {
  it("is ONE input, with a slot drawn for every position", () => {
    render(<CodeField aria-label="Your code" value="" onChange={() => {}} />)
    expect(screen.getAllByLabelText("Your code")).toHaveLength(1)
    expect(cells()).toHaveLength(OTP_LENGTH)
  })

  it("keeps the semantics a phone needs to offer the code, and never a number input", () => {
    render(<CodeField aria-label="Your code" value="" onChange={() => {}} />)
    const input = screen.getByLabelText("Your code")
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveAttribute("inputmode", "numeric")
    expect(input).toHaveAttribute("autocomplete", "one-time-code")
    expect(input).not.toHaveAttribute("maxlength")
  })

  it("draws the typed digits in order and marks the next position", () => {
    render(<CodeField aria-label="Your code" value="041" onChange={() => {}} />)
    expect(cells().map((c) => c.textContent)).toEqual(["0", "4", "1", "", "", ""])
    expect(document.querySelector("[data-active]")).toHaveAttribute("data-index", "3")
  })

  it("keeps the mark on the last slot when the code is complete", () => {
    render(<CodeField aria-label="Your code" value={"1".repeat(OTP_LENGTH)} onChange={() => {}} />)
    expect(document.querySelector("[data-active]")).toHaveAttribute(
      "data-index",
      String(OTP_LENGTH - 1),
    )
  })

  it("⚠ shows a longer value in full instead of drawing it as a valid-looking code", () => {
    render(<CodeField aria-label="Your code" value="12345678" onChange={() => {}} />)
    expect(cells()).toHaveLength(0)
    const input = screen.getByLabelText("Your code")
    expect(input).toHaveValue("12345678")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("reports what was typed to the caller", () => {
    const onChange = vi.fn()
    render(<CodeField aria-label="Your code" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("Your code"), { target: { value: "9" } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
