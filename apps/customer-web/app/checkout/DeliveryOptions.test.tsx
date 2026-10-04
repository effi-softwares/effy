import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { DeliveryQuoteDTO } from "@effy/shared-types"

import { DeliveryOptions } from "./DeliveryOptions"

const NOW = new Date("2026-10-08T09:00:00+11:00") // Thursday 9 am, Melbourne
const STD = { method: "standard" as const, feeAmount: "6.00", promisedFrom: null, promisedTo: null }
const SD = { method: "same_day" as const, feeAmount: "11.00", promisedFrom: null, promisedTo: null }
const EVENING = {
  slotId: "evening", date: "2026-10-08",
  startAt: "2026-10-08T17:00:00+11:00", endAt: "2026-10-08T19:00:00+11:00", cutoffAt: "2026-10-08T15:00:00+11:00",
}
const LATE = {
  slotId: "late", date: "2026-10-08",
  startAt: "2026-10-08T19:00:00+11:00", endAt: "2026-10-08T21:00:00+11:00", cutoffAt: "2026-10-08T17:00:00+11:00",
}

function quote(over: Partial<DeliveryQuoteDTO> = {}): DeliveryQuoteDTO {
  return {
    postcode: "3000", serviced: true, sameDayAvailableUntil: null, expiresAt: "2026-10-08T12:00:00+11:00",
    packages: [{ shopRef: "pkg-1", options: [STD, SD] }],
    sameDaySlots: [EVENING, LATE], sameDayUnavailableReason: null,
    standardDays: [{ date: "2026-10-09" }, { date: "2026-10-10" }, { date: "2026-10-13" }],
    ...over,
  }
}

function setup(props: Partial<React.ComponentProps<typeof DeliveryOptions>> = {}) {
  const handlers = { onMethodChange: vi.fn(), onSlotChange: vi.fn(), onStandardDateChange: vi.fn() }
  render(
    <DeliveryOptions
      quote={quote()}
      method="standard"
      slotId={null}
      standardDate="2026-10-09"
      currency="AUD"
      now={NOW}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe("DeliveryOptions — same-day slots", () => {
  it("shows each open slot with its window and the same-day fee", () => {
    setup({ method: "same_day" })
    const group = screen.getByRole("group", { name: "Choose a delivery time" })

    const evening = within(group).getByRole("radio", { name: /Today, 5 pm – 7 pm/ })
    const late = within(group).getByRole("radio", { name: /Today, 7 pm – 9 pm/ })
    expect(evening).toBeInTheDocument()
    expect(late).toBeInTheDocument()
    // ⚠ The SAME fee on every slot: a slot has no price of its own (FR-021).
    expect(within(group).getAllByText("$11.00")).toHaveLength(2)
  })

  it("⚠ selects no slot for the shopper (FR-006)", () => {
    setup({ method: "same_day" })
    for (const radio of within(screen.getByRole("group", { name: "Choose a delivery time" })).getAllByRole("radio")) {
      expect(radio).not.toBeChecked()
    }
  })

  it("reports the slot the shopper picks, and shows it selected", async () => {
    const user = userEvent.setup()
    const h = setup({ method: "same_day" })
    await user.click(screen.getByRole("radio", { name: /Today, 7 pm – 9 pm/ }))
    expect(h.onSlotChange).toHaveBeenCalledWith("late")
  })

  it("keeps a selection that is still in the quote", () => {
    setup({ method: "same_day", slotId: "late" })
    expect(screen.getByRole("radio", { name: /Today, 7 pm – 9 pm/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: /Today, 5 pm – 7 pm/ })).not.toBeChecked()
  })

  it("a slot past its cutoff cannot be selected, without waiting for a re-quote", () => {
    setup({ method: "same_day", now: new Date("2026-10-08T15:30:00+11:00") })
    expect(screen.getByRole("radio", { name: /Today, 5 pm – 7 pm/ })).toBeDisabled()
    expect(screen.getByRole("radio", { name: /Today, 7 pm – 9 pm/ })).toBeEnabled()
    expect(screen.getByText("Closed")).toBeInTheDocument()
  })

  it("shows no slots while standard is chosen", () => {
    setup({ method: "standard" })
    expect(screen.queryByRole("group", { name: "Choose a delivery time" })).not.toBeInTheDocument()
  })
})

describe("DeliveryOptions — why same-day is not offered (FR-004)", () => {
  it("says today's times are closed or full — which will not be true tomorrow", () => {
    setup({ quote: quote({ sameDaySlots: [], sameDayUnavailableReason: "slots_closed" }) })
    expect(screen.getByText(/same-day delivery times are closed or full/i)).toBeInTheDocument()
    expect(screen.queryByText(/isn’t available for this address/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /same-day delivery/i })).not.toBeInTheDocument()
  })

  it("says the address is not eligible — which will still be true tomorrow", () => {
    setup({
      quote: quote({ sameDaySlots: [], sameDayUnavailableReason: "not_eligible", packages: [{ shopRef: "pkg-1", options: [STD] }] }),
    })
    expect(screen.getByText(/isn’t available for this address/i)).toBeInTheDocument()
    expect(screen.queryByText(/closed or full/i)).not.toBeInTheDocument()
  })
})

describe("DeliveryOptions — standard days", () => {
  it("lists each day with the standard fee, the earliest selected", () => {
    setup()
    const group = screen.getByRole("group", { name: "Choose a delivery day" })
    const radios = within(group).getAllByRole("radio")

    expect(radios).toHaveLength(3)
    expect(within(group).getByRole("radio", { name: /^Tomorrow/ })).toBeChecked()
    expect(within(group).getByRole("radio", { name: /^Sat 10 Oct/ })).not.toBeChecked()
    expect(within(group).getByRole("radio", { name: /^Tue 13 Oct/ })).toBeInTheDocument()
    // The same fee on every day (FR-021).
    expect(within(group).getAllByText("$6.00")).toHaveLength(3)
  })

  it("reports the day the shopper picks", async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole("radio", { name: /^Tue 13 Oct/ }))
    expect(h.onStandardDateChange).toHaveBeenCalledWith("2026-10-13")
  })

  it("shows no day list when every delivery goes same-day", () => {
    setup({ method: "same_day" })
    expect(screen.queryByRole("group", { name: /delivery day|day for the rest/i })).not.toBeInTheDocument()
  })
})

describe("DeliveryOptions — a mixed order (SC-010)", () => {
  const mixed = quote({
    packages: [{ shopRef: "pkg-1", options: [STD, SD] }, { shopRef: "pkg-2", options: [{ ...STD, feeAmount: "7.00" }] }],
  })

  it("asks for one slot AND one day, and says how many deliveries arrive today", () => {
    setup({ quote: mixed, method: "same_day" })

    expect(screen.getByRole("group", { name: "Choose a delivery time" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Choose a day for the rest" })).toBeInTheDocument()
    expect(screen.getByText("1 of your 2 deliveries can arrive today.")).toBeInTheDocument()
  })

  it("prices each part: the same-day delivery on the slots, the standard one on the days", () => {
    setup({ quote: mixed, method: "same_day" })
    expect(within(screen.getByRole("group", { name: "Choose a delivery time" })).getAllByText("$11.00")).toHaveLength(2)
    expect(within(screen.getByRole("group", { name: "Choose a day for the rest" })).getAllByText("$7.00")).toHaveLength(3)
    // And the method row carries the whole order's delivery fee.
    expect(within(screen.getByRole("group", { name: "How fast?" })).getByText("$18.00")).toBeInTheDocument()
  })

  it("never names a shop or how the order is split", () => {
    const { container } = render(
      <DeliveryOptions
        quote={mixed} method="same_day" slotId={null} standardDate="2026-10-09" currency="AUD" now={NOW}
        onMethodChange={vi.fn()} onSlotChange={vi.fn()} onStandardDateChange={vi.fn()}
      />,
    )
    for (const banned of [/\bshops?\b/i, /\bpackages?\b/i, /\bwarehouse\b/i, /pkg-/]) {
      expect(container.textContent ?? "").not.toMatch(banned)
    }
  })
})

describe("DeliveryOptions — the method", () => {
  it("offers both methods with the order's fee for each, and reports the choice", async () => {
    const user = userEvent.setup()
    const h = setup()
    const group = screen.getByRole("group", { name: "How fast?" })
    expect(within(group).getByText("$11.00")).toBeInTheDocument()
    expect(within(group).getByText("$6.00")).toBeInTheDocument()

    await user.click(within(group).getByRole("radio", { name: /same-day delivery/i }))
    expect(h.onMethodChange).toHaveBeenCalledWith("same_day")
  })

  it("disables every control while the order is being placed", () => {
    setup({ method: "same_day", disabled: true })
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled()
  })
})
