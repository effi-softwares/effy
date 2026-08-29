import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ArrivalEstimateDTO } from "@effy/shared-types"

import { ArrivalPanel, arrivalLabel } from "./ArrivalPanel"

const est = (over: Partial<ArrivalEstimateDTO> = {}): ArrivalEstimateDTO => ({
  method: "standard",
  promisedFrom: "2026-09-02",
  promisedTo: "2026-09-02",
  ...over,
})

/**
 * ⚠ THE RULE THIS FILE EXISTS TO PIN (052 FR-007, research R4).
 *
 * `promised_from`/`promised_to` are `date` columns. The platform has NO delivery time window and
 * cannot derive one. An earlier draft of this design rendered "Today, 5:00 – 8:00 pm" — a promise the
 * business has not made, printed on the one document a customer treats as a record.
 */
describe("arrivalLabel — dates, never times", () => {
  it("never renders a time of day", () => {
    for (const a of [
      est(),
      est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-04" }),
      est({ promisedFrom: null, promisedTo: "2026-09-04" }),
    ]) {
      expect(arrivalLabel(a)).not.toMatch(/\d{1,2}[:.]\d{2}/)
      expect(arrivalLabel(a)).not.toMatch(/\b(am|pm)\b/i)
    }
  })

  it("renders a single date as one day, and a spread as a range", () => {
    expect(arrivalLabel(est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-02" }))).not.toContain("–")
    expect(arrivalLabel(est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-04" }))).toContain("–")
  })

  /**
   * ⚠ When the platform has no promise it SAYS SO. Inventing a date on a receipt would be a false
   * fact on a financial record, and "we'll confirm" is both true and useful.
   */
  it("says it will confirm rather than inventing a date", () => {
    expect(arrivalLabel(est({ promisedFrom: null, promisedTo: null }))).toBe(
      "We'll confirm your delivery date",
    )
  })
})

describe("ArrivalPanel", () => {
  it("labels the delivery method the customer chose", () => {
    render(<ArrivalPanel stage="confirmed" arrivals={[est({ method: "same_day" })]} />)
    expect(screen.getByText("Same-day")).toBeInTheDocument()
  })

  /**
   * More than one estimate means the order arrives in more than one delivery — a fact about the
   * CUSTOMER'S experience. ⚠ It must not name a shop or imply which node handles which package.
   */
  it("numbers multiple deliveries without disclosing fulfilment structure", () => {
    const { container } = render(
      <ArrivalPanel
        stage="packing"
        arrivals={[est({ method: "same_day" }), est({ method: "standard" })]}
      />,
    )
    expect(screen.getByText("Delivery 1")).toBeInTheDocument()
    expect(screen.getByText("Delivery 2")).toBeInTheDocument()
    const text = container.textContent ?? ""
    for (const banned of [/\bshops?\b/i, /\brings?\b/i, /\bdistance\b/i, /\bwarehouse\b/i]) {
      expect(text).not.toMatch(banned)
    }
  })

  it("renders the progress track without any arrival at all", () => {
    render(<ArrivalPanel stage="on_the_way" arrivals={[]} />)
    expect(screen.getByText("On the way")).toBeInTheDocument()
    expect(screen.getByLabelText("Order progress")).toBeInTheDocument()
  })

  /**
   * ⚠ SC-009's mechanical half: the stage must be announced in WORDS, not by a dot's colour alone.
   * Strip every hue and the current step is still identifiable.
   */
  it("marks the current step in text, not only in colour", () => {
    render(<ArrivalPanel stage="packing" arrivals={[]} />)
    expect(screen.getByText(/current step/i)).toBeInTheDocument()
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
  })
})
