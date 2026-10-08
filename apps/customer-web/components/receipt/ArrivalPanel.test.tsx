import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ArrivalEstimateDTO } from "@effy/shared-types"

import { ArrivalPanel, arrivalLabel } from "./ArrivalPanel"

const est = (over: Partial<ArrivalEstimateDTO> = {}): ArrivalEstimateDTO => ({
  method: "standard",
  promisedFrom: "2026-09-02",
  promisedTo: "2026-09-02",
  windowStart: null,
  windowEnd: null,
  ...over,
})

interface ArrivalCase {
  name: string
  now: string
  input: Pick<ArrivalEstimateDTO, "promisedFrom" | "promisedTo" | "windowStart" | "windowEnd">
  expect: string
}

/**
 * ⚠ THE SHARED FIXTURE. The emailed receipt (`edge-api/notifications`) and both mobile apps are
 * tested against this same file. The page saying "Today, 5 pm – 7 pm" while the email says
 * "Thursday" is the defect it exists to catch.
 */
const fixture = JSON.parse(
  // Resolved from the package root (vitest's cwd): under jsdom `import.meta.url` is not a file URL.
  readFileSync(resolve(process.cwd(), "../../packages/shared-types/src/delivery-window.fixtures.json"), "utf8"),
) as { arrival: ArrivalCase[] }

describe("arrivalLabel — one wording with the email and the apps", () => {
  it("has cases to run", () => {
    expect(fixture.arrival.length).toBeGreaterThan(10)
  })

  for (const c of fixture.arrival) {
    it(c.name, () => {
      expect(arrivalLabel(est(c.input), new Date(c.now))).toBe(c.expect)
    })
  }
})

/**
 * ⚠ THE RULE 052 PINNED, RESTATED FOR 069 (052 FR-007, research R4; 069 research R1).
 *
 * 052 forbade a time of day outright, because the platform had no delivery window and an earlier
 * design had drawn one anyway. 069 SELLS a window — so a time may now appear, and ONLY when the
 * order carries one. Without a window this must still never print a time.
 */
describe("arrivalLabel — a time only when a window was sold", () => {
  it("never renders a time of day for an order with no window", () => {
    for (const a of [
      est(),
      est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-04" }),
      est({ promisedFrom: null, promisedTo: "2026-09-04" }),
    ]) {
      expect(arrivalLabel(a)).not.toMatch(/\d{1,2}[:.]\d{2}/)
      expect(arrivalLabel(a)).not.toMatch(/\b(am|pm)\b/i)
    }
  })

  it("renders the window the customer chose, in Melbourne time", () => {
    const a = est({
      method: "same_day",
      promisedFrom: "2026-10-08",
      promisedTo: "2026-10-08",
      windowStart: "2026-10-08T17:00:00+11:00",
      windowEnd: "2026-10-08T19:00:00+11:00",
    })
    expect(arrivalLabel(a, new Date("2026-10-08T09:00:00+11:00"))).toBe("Today, 5 pm – 7 pm")
  })

  it("078 — a Standard delivery sold a window says its day AND its window, as one delivery", () => {
    const a = est({
      method: "standard",
      promisedFrom: "2026-10-13",
      promisedTo: "2026-10-13",
      windowStart: "2026-10-13T16:00:00+11:00",
      windowEnd: "2026-10-13T18:00:00+11:00",
    })
    expect(arrivalLabel(a, new Date("2026-10-08T09:00:00+11:00"))).toBe("Tue 13 Oct, 4 pm – 6 pm")
    render(<ArrivalPanel stage="confirmed" arrivals={[a]} />)
    expect(screen.getByText("Standard")).toBeInTheDocument()
    expect(screen.getByText("Arriving")).toBeInTheDocument()
    expect(screen.queryByText(/Delivery 1/)).not.toBeInTheDocument()
  })

  it("renders a single date as one day, and a spread as a range", () => {
    expect(arrivalLabel(est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-02" }))).not.toContain("–")
    expect(arrivalLabel(est({ promisedFrom: "2026-09-02", promisedTo: "2026-09-04" }))).toContain("–")
  })

  /**
   * ⚠ When the platform has no promise it SAYS SO. Inventing a date on a receipt would be a false
   * fact on a financial record, and "we'll confirm" is both true and useful. Every order placed
   * before 069 is this case.
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
