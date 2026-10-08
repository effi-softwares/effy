import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { COVERAGE_LABEL, COVERAGE_REFUSAL_SENTENCE } from "@effy/shared-types"

import { CoverageNote } from "./CoverageNote"

describe("CoverageNote — who delivers to an address (076)", () => {
  it("names Effy's own delivery", () => {
    render(<CoverageNote coverage="effy" />)
    expect(screen.getByTestId("coverage-label")).toHaveTextContent(COVERAGE_LABEL.effy)
  })

  it("names courier delivery", () => {
    render(<CoverageNote coverage="courier" />)
    expect(screen.getByTestId("coverage-label")).toHaveTextContent(COVERAGE_LABEL.courier)
  })

  it("⚠ shows the ONE refusal sentence, exactly, when nobody delivers", () => {
    render(<CoverageNote coverage="none" />)
    expect(screen.getByTestId("coverage-refusal").textContent).toBe(COVERAGE_REFUSAL_SENTENCE)
  })

  it("says nothing when the server did not", () => {
    const { container } = render(<CoverageNote coverage={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
