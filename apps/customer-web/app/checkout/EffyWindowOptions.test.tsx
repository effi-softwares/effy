import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DELIVERY_WINDOW_WORDS, type EffyWindowsDTO, type EffyWindowsView } from "@effy/shared-types"

import type { DeliveryChoice } from "@/lib/delivery-choice"

import { EffyWindowOptions } from "./EffyWindowOptions"

/**
 * 078 / 085 — the picker, drawn from the SAME fixture the customer app's picker is held to
 * (`packages/shared-types/src/effy-windows.fixtures.json`). What a shopper reads on the website and
 * in the app is one set of words; this proves the website shows them and adds none of its own.
 */
interface Case { name: string; now: string; input: EffyWindowsDTO; expect: EffyWindowsView }
const cases = (
  JSON.parse(readFileSync(resolve(__dirname, "../../../../packages/shared-types/src/effy-windows.fixtures.json"), "utf8")) as { cases: Case[] }
).cases
const byName = (part: string) => cases.find((c) => c.name.includes(part))!
const MAIN = byName("today has two windows left")
/** Fri and Sat can be bought with no time (Sat's windows are all taken); Mon cannot; ASAP is offered. */
const FLEX = byName("085")

/** The picker with its choice held, as the checkout holds it — so every click is seen through. */
function Harness({ c, initial = null, onChoose }: { c: Case; initial?: DeliveryChoice | null; onChoose: (n: DeliveryChoice | null) => void }) {
  const [chosen, setChosen] = useState<DeliveryChoice | null>(initial)
  return (
    <EffyWindowOptions
      windows={c.input}
      chosen={chosen}
      onChoose={(n) => {
        onChoose(n)
        setChosen(n)
      }}
      currency="AUD"
      now={new Date(c.now)}
    />
  )
}
function setup(c: Case, initial: DeliveryChoice | null = null) {
  const onChoose = vi.fn()
  render(<Harness c={c} initial={initial} onChoose={onChoose} />)
  return { onChoose, user: userEvent.setup() }
}

const radios = () => screen.getAllByRole("radio") as HTMLInputElement[]
const checked = () => radios().filter((r) => r.checked)
const dayRadio = (label: string) => screen.getByRole("radio", { name: new RegExp(`^${label}`) })
const windowsIn = (group: HTMLElement) => within(group).getAllByRole("radio").map((r) => r.closest("label")!.textContent)
const today = () => screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })

describe("EffyWindowOptions — one choice for the order", () => {
  it("Same-day delivery lists today's windows with the time to order by and what each adds", () => {
    setup(MAIN)
    expect(windowsIn(today())).toEqual(["4 pm – 6 pmOrder by 2 pm+$5.00", "6:30 pm – 8:30 pmOrder by 5:15 pm+$7.00"])
  })

  it("⚠ nothing is chosen for the shopper — no window, no day, not 'as soon as possible'", () => {
    setup(FLEX)
    expect(checked()).toEqual([])
    expect(screen.queryByTestId("day-times")).not.toBeInTheDocument()
  })

  it("a window today is reported with its day", async () => {
    const { onChoose, user } = setup(MAIN)
    await user.click(within(today()).getByRole("radio", { name: /4 pm – 6 pm/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "afternoon", date: "2026-10-08" })
  })

  it("never shows how full a window is", () => {
    setup(FLEX)
    expect(screen.queryByText(/left|remaining|places|spots/i)).not.toBeInTheDocument()
  })
})

describe("085 — a day is a complete choice", () => {
  it("choosing a day chooses its Any-time window and says 'any time during the day' — no times shown", async () => {
    const { onChoose, user } = setup(FLEX)
    await user.click(dayRadio("Fri 9 Oct"))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "anytime", date: "2026-10-09" })
    expect(screen.getByText(DELIVERY_WINDOW_WORDS.anyTimeDay)).toBeInTheDocument()
    expect(screen.queryByTestId("day-times")).not.toBeInTheDocument()
  })

  it("choosing another day replaces it", async () => {
    const { onChoose, user } = setup(FLEX)
    await user.click(dayRadio("Fri 9 Oct"))
    await user.click(dayRadio("Sat 10 Oct"))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "anytime", date: "2026-10-10" })
    expect(checked()).toEqual([dayRadio("Sat 10 Oct")])
  })

  it("a day whose windows are all taken can still be bought with no time — and offers no time", async () => {
    const { user } = setup(FLEX)
    await user.click(dayRadio("Sat 10 Oct"))
    expect(screen.queryByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen })).not.toBeInTheDocument()
  })

  it("a day that has neither is shown, with its sentence, and cannot be chosen", () => {
    setup(MAIN)
    expect(dayRadio("Sat 10 Oct")).toBeDisabled()
    expect(dayRadio("Sat 10 Oct").closest("label")).toHaveTextContent(DELIVERY_WINDOW_WORDS.dayFull)
  })
})

describe("085 — a time is optional", () => {
  it("'Need a specific time?' is under the chosen day only, and opening it changes nothing", async () => {
    const { onChoose, user } = setup(FLEX)
    expect(screen.queryByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen })).not.toBeInTheDocument()
    await user.click(dayRadio("Fri 9 Oct"))
    const toggle = screen.getByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    onChoose.mockClear()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(onChoose).not.toHaveBeenCalled()
    expect(within(screen.getByTestId("day-times")).getByText(DELIVERY_WINDOW_WORDS.timeOptionHint)).toBeInTheDocument()
    for (const r of within(screen.getByTestId("day-times")).getAllByRole("radio")) expect(r).not.toBeChecked()
  })

  it("choosing a time promises it; closing the option goes back to the day alone", async () => {
    const { onChoose, user } = setup(FLEX)
    await user.click(dayRadio("Fri 9 Oct"))
    await user.click(screen.getByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen }))
    await user.click(within(screen.getByTestId("day-times")).getByRole("radio", { name: /10 am – 12 pm/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "morning", date: "2026-10-09" })
    expect(screen.queryByText(DELIVERY_WINDOW_WORDS.anyTimeDay)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen }))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "anytime", date: "2026-10-09" })
    expect(screen.queryByTestId("day-times")).not.toBeInTheDocument()
  })

  it("choosing another day lets go of the time", async () => {
    const { onChoose, user } = setup(FLEX)
    await user.click(dayRadio("Fri 9 Oct"))
    await user.click(screen.getByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen }))
    await user.click(within(screen.getByTestId("day-times")).getByRole("radio", { name: /4 pm – 6 pm/ }))
    await user.click(dayRadio("Sat 10 Oct"))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "anytime", date: "2026-10-10" })
  })

  it("⚠ a day with no untimed room left needs a time: choosing it chooses nothing, and its times open", async () => {
    const { onChoose, user } = setup(FLEX)
    await user.click(dayRadio("Mon 12 Oct"))
    expect(onChoose).toHaveBeenLastCalledWith(null)
    expect(screen.getByText(DELIVERY_WINDOW_WORDS.timeRequired)).toBeInTheDocument()
    await user.click(within(screen.getByTestId("day-times")).getByRole("radio", { name: /10 am – 12 pm/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ slotId: "morning", date: "2026-10-12" })
  })

  it("with no Any-time window at all (before 085, or none defined), every day works that way", async () => {
    const { onChoose, user } = setup(MAIN)
    expect(screen.queryByRole("radio", { name: new RegExp(DELIVERY_WINDOW_WORDS.asapTitle) })).not.toBeInTheDocument()
    await user.click(dayRadio("Fri 9 Oct"))
    expect(onChoose).toHaveBeenLastCalledWith(null)
    expect(windowsIn(screen.getByTestId("day-times"))).toEqual(["10 am – 12 pm", "4 pm – 6 pm", "6:30 pm – 8:30 pm+$2.00"])
  })

  it("comes back with the chosen time's day open", () => {
    setup(FLEX, { slotId: "morning", date: "2026-10-12" })
    expect(dayRadio("Mon 12 Oct")).toBeChecked()
    expect(within(screen.getByTestId("day-times")).getByRole("radio", { name: /10 am – 12 pm/ })).toBeChecked()
  })
})

describe("085 — as soon as possible", () => {
  it("is one choice, with the estimate said as one and no day", async () => {
    const { onChoose, user } = setup(FLEX)
    const asap = screen.getByRole("radio", { name: new RegExp(DELIVERY_WINDOW_WORDS.asapTitle) })
    expect(asap.closest("label")).toHaveTextContent("As soon as possible — usually within 2–3 days")
    await user.click(asap)
    expect(onChoose).toHaveBeenLastCalledWith({ asap: true })
    expect(checked()).toEqual([asap])
  })
})

describe("⚠ 085 — at most one thing is ever chosen, whatever the order of choices", () => {
  type Step = [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>]
  const steps: Step[] = [
    ["a window today", (u) => u.click(within(today()).getByRole("radio", { name: /4 pm – 6 pm/ }))],
    ["a day", (u) => u.click(dayRadio("Fri 9 Oct"))],
    ["a time on a day", async (u) => {
      await u.click(dayRadio("Sat 10 Oct"))
      await u.click(dayRadio("Fri 9 Oct"))
      await u.click(screen.getByRole("button", { name: DELIVERY_WINDOW_WORDS.timeOptionOpen }))
      await u.click(within(screen.getByTestId("day-times")).getByRole("radio", { name: /6:30 pm/ }))
    }],
    ["as soon as possible", (u) => u.click(screen.getByRole("radio", { name: new RegExp(DELIVERY_WINDOW_WORDS.asapTitle) }))],
  ]
  const pairs = steps.flatMap((a) => steps.filter((b) => b !== a).map((b) => [`${a[0]} → ${b[0]}`, a[1], b[1]] as const))

  it.each(pairs)("%s", async (_name, first, second) => {
    const { onChoose, user } = setup(FLEX)
    await first(user)
    await second(user)
    const last = onChoose.mock.calls.at(-1)![0] as DeliveryChoice
    // What is checked is exactly the last choice: one radio, plus its day when it is a time on a day.
    const on = checked()
    if ("asap" in last) {
      expect(on.map((r) => r.value)).toEqual(["asap"])
    } else if (last.date === "2026-10-08") {
      expect(on.map((r) => r.value)).toEqual([`${last.date}|${last.slotId}`])
    } else if (last.slotId === "anytime") {
      expect(on.map((r) => r.value)).toEqual([last.date])
    } else {
      expect(on.map((r) => r.value).sort()).toEqual([last.date, `${last.date}|${last.slotId}`].sort())
    }
  })
})

describe("the shared words, and nothing else", () => {
  it("'no windows left today' and 'we don't deliver today' are different sentences", () => {
    const { unmount } = render(
      <EffyWindowOptions windows={byName("have all gone").input} chosen={null} onChoose={vi.fn()} currency="AUD" now={new Date("2026-10-08T20:00:00+11:00")} />,
    )
    expect(today()).toHaveTextContent(DELIVERY_WINDOW_WORDS.todayClosed)
    unmount()
    setup(byName("not a delivery day"))
    expect(today()).toHaveTextContent(DELIVERY_WINDOW_WORDS.todayNotDeliveryDay)
  })

  it("a window whose cutoff has passed since the quote is shown closed and cannot be chosen", () => {
    setup(byName("cutoff has passed since the quote"))
    expect(within(today()).getByRole("radio")).toBeDisabled()
    expect(today()).toHaveTextContent("Closed")
  })

  it("with nothing on any day it says the one sentence and offers no choice — and no courier", () => {
    setup(byName("nothing on any day"))
    expect(screen.getByRole("status")).toHaveTextContent(DELIVERY_WINDOW_WORDS.noWindows)
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(screen.queryByText(/courier/i)).not.toBeInTheDocument()
  })

  it.each(cases)("shows exactly the shared view's words: $name", (c) => {
    setup(c)
    if (c.expect.unavailable) return
    const text = document.body.textContent ?? ""
    if (c.expect.today?.sentence) expect(text).toContain(c.expect.today.sentence)
    for (const w of c.expect.today?.windows ?? []) {
      expect(text).toContain(w.label)
      if (w.note) expect(text).toContain(w.note)
    }
    for (const day of c.expect.later) expect(dayRadio(day.label)).toBeInTheDocument()
    if (c.expect.asap) expect(text).toContain(c.expect.asap.title)
  })
})
