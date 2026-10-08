import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DELIVERY_WINDOW_WORDS, type EffyWindowsDTO, type EffyWindowsView } from "@effy/shared-types"

import { EffyWindowOptions } from "./EffyWindowOptions"

/**
 * 078 — the picker, drawn from the SAME fixture the customer app's picker is held to
 * (`packages/shared-types/src/effy-windows.fixtures.json`). What a shopper reads on the website and
 * in the app is one set of words; this proves the website shows them and adds none of its own.
 */
interface Case { name: string; now: string; input: EffyWindowsDTO; expect: EffyWindowsView }
const cases = (
  JSON.parse(readFileSync(resolve(__dirname, "../../../../packages/shared-types/src/effy-windows.fixtures.json"), "utf8")) as { cases: Case[] }
).cases
const byName = (part: string) => cases.find((c) => c.name.includes(part))!
const MAIN = byName("today has two windows left")

function setup(c: Case, props: Partial<React.ComponentProps<typeof EffyWindowOptions>> = {}) {
  const onChoose = vi.fn()
  render(<EffyWindowOptions windows={c.input} chosen={null} onChoose={onChoose} currency="AUD" now={new Date(c.now)} {...props} />)
  return onChoose
}
const rows = (group: HTMLElement) => within(group).getAllByRole("radio").map((r) => r.closest("label")!.textContent)

describe("EffyWindowOptions — two sections, one window for the order", () => {
  it("Same-day delivery lists today's windows with the time to order by and what each adds", () => {
    setup(MAIN)
    const today = screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })
    expect(rows(today)).toEqual(["4 pm – 6 pmOrder by 2 pm+$5.00", "6:30 pm – 8:30 pmOrder by 5:15 pm+$7.00"])
  })

  it("Standard delivery shows the delivery days as tabs and the first day's windows — with no order-by time", () => {
    setup(MAIN)
    const standard = screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionStandard })
    expect(within(standard).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Fri 9 Oct", "Sat 10 Oct", "Mon 12 Oct"])
    expect(within(standard).getByRole("tab", { name: "Fri 9 Oct" })).toHaveAttribute("aria-selected", "true")
    // A window with no surcharge shows no amount at all; the evening one shows what it adds.
    expect(rows(standard)).toEqual(["10 am – 12 pm", "4 pm – 6 pm", "6:30 pm – 8:30 pm+$2.00"])
  })

  it("⚠ nothing is chosen for the shopper — not today's first window, not the first day's", () => {
    setup(MAIN)
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked()
  })

  it("choosing a window reports the window AND its day", async () => {
    const onChoose = setup(MAIN)
    await userEvent.click(screen.getByRole("tab", { name: "Mon 12 Oct" }))
    await userEvent.click(screen.getByRole("radio", { name: /10 am – 12 pm/ }))
    expect(onChoose).toHaveBeenCalledWith({ slotId: "morning", date: "2026-10-12" })
  })

  it("the same window on two days is two choices: only the chosen day's is checked", async () => {
    setup(MAIN, { chosen: { slotId: "afternoon", date: "2026-10-09" } })
    const today = screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })
    expect(within(today).getByRole("radio", { name: /4 pm – 6 pm/ })).not.toBeChecked()
    const standard = screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionStandard })
    expect(within(standard).getByRole("radio", { name: /4 pm – 6 pm/ })).toBeChecked()
  })

  it("opens on the chosen window's day when the shopper comes back to this step", () => {
    setup(MAIN, { chosen: { slotId: "morning", date: "2026-10-12" } })
    expect(screen.getByRole("tab", { name: "Mon 12 Oct" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("radio", { name: /10 am – 12 pm/ })).toBeChecked()
  })

  it("a day with every window taken says so under its tab", async () => {
    setup(MAIN)
    await userEvent.click(screen.getByRole("tab", { name: "Sat 10 Oct" }))
    expect(screen.getByRole("tabpanel")).toHaveTextContent(DELIVERY_WINDOW_WORDS.dayFull)
    expect(within(screen.getByRole("tabpanel")).queryByRole("radio")).not.toBeInTheDocument()
  })

  it("a window whose cutoff has passed since the quote is shown closed and cannot be chosen", () => {
    setup(byName("cutoff has passed since the quote"))
    const today = screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })
    expect(within(today).getByRole("radio")).toBeDisabled()
    expect(today).toHaveTextContent("Closed")
  })

  it("⚠ 'no windows left today' and 'we don't deliver today' are different sentences", () => {
    const { unmount } = render(
      <EffyWindowOptions windows={byName("have all gone").input} chosen={null} onChoose={vi.fn()} currency="AUD" now={new Date("2026-10-08T20:00:00+11:00")} />,
    )
    expect(screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })).toHaveTextContent(DELIVERY_WINDOW_WORDS.todayClosed)
    // Friday is full, so the section opens on the first day that has a window.
    expect(screen.getByRole("tab", { name: "Sat 10 Oct" })).toHaveAttribute("aria-selected", "true")
    unmount()
    setup(byName("not a delivery day"))
    expect(screen.getByRole("group", { name: DELIVERY_WINDOW_WORDS.sectionSameDay })).toHaveTextContent(DELIVERY_WINDOW_WORDS.todayNotDeliveryDay)
  })

  it("with nothing on any day it says the one sentence and offers no choice — and no courier", () => {
    setup(byName("nothing on any day"))
    expect(screen.getByRole("status")).toHaveTextContent(DELIVERY_WINDOW_WORDS.noWindows)
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(screen.queryByText(/courier/i)).not.toBeInTheDocument()
  })

  it("never shows how full a window is", () => {
    setup(MAIN)
    expect(screen.queryByText(/left|remaining|places|spots/i)).not.toBeInTheDocument()
  })

  it.each(cases)("shows exactly the shared view's words: $name", (c) => {
    setup(c)
    if (c.expect.unavailable) return
    const text = document.body.textContent ?? ""
    // The day whose windows are open on arrival: the first that has any.
    const shown = c.expect.later.find((d) => d.windows.length > 0) ?? c.expect.later[0] ?? null
    for (const day of [c.expect.today, shown]) {
      if (!day) continue
      if (day.sentence) expect(text).toContain(day.sentence)
      for (const w of day.windows) {
        expect(text).toContain(w.label)
        if (w.note) expect(text).toContain(w.note)
      }
    }
    for (const day of c.expect.later) expect(screen.getByRole("tab", { name: day.label })).toBeInTheDocument()
  })
})
