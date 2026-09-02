import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DashboardEmptyState } from "../EmptyState"

/**
 * US1 / FR-008 (T016) — the steady state must not read as a failure.
 *
 * ⚠ THE POINT IS THE WORDING, so the wording is what is asserted. A shop that is fully caught up and
 * a shop whose console is broken must never look alike to the person checking whether they are
 * behind — and "No results" / "No data" / a retry button are all how that confusion gets shipped.
 */
describe("dashboard steady state", () => {
  it("states positively that there is nothing to do", () => {
    render(<DashboardEmptyState />)
    expect(screen.getByText("Nothing needs you right now")).toBeInTheDocument()
  })

  it("says what will happen next, so the screen does not read as stalled", () => {
    render(<DashboardEmptyState />)
    expect(screen.getByText(/New orders appear here automatically/i)).toBeInTheDocument()
  })

  it("offers no retry — there is nothing to retry, this is success", () => {
    render(<DashboardEmptyState />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("uses none of the vocabulary of an error or an empty search", () => {
    render(<DashboardEmptyState />)
    const text = document.body.textContent ?? ""
    for (const word of ["No results", "No data", "went wrong", "Error", "failed", "Try again"]) {
      expect(text, `steady state must not say "${word}"`).not.toContain(word)
    }
  })
})
