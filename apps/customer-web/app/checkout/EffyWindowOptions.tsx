"use client"

import { useEffect, useId, useState } from "react"

import { DELIVERY_TYPE_WORDS, effyWindowsView, type EffyDayView, type EffyWindowsDTO } from "@effy/shared-types"

import { formatCents, parseCents } from "@/lib/cart-totals"
import type { ChosenWindow } from "@/lib/delivery-choice"
import { formatMoney } from "@/lib/money"

/**
 * When the order arrives, under the new delivery model (078): ONE window for the whole order.
 *
 *   Same-day delivery   today's open windows, each with the time to order by;
 *   Standard delivery   the next delivery days as tabs, each with its own windows.
 *
 * 079 — the section is headed "Delivered by Effy": every window on this screen, today's or a later
 * day's, is one Effy's own drivers deliver in. (An address Effy does not deliver to never reaches
 * this component — it gets `CourierDelivery`, with no window to pick.)
 *
 * ⚠ "STANDARD" KEPT ITS NAME AND CHANGED ITS MEANING: it is Effy, on a later day, in a window — the
 * customer chooses a time on either side of the page.
 *
 * ⚠ EVERY WORD HERE IS `effyWindowsView`'S, NOT THIS FILE'S. The customer app renders the same
 * function's Kotlin twin, pinned to the same fixture; this component only lays the words out.
 *
 * ⚠ NOTHING IS EVER SELECTED FOR THE SHOPPER (FR-010). A window is a promise about when someone will
 * be home. That includes the day tab: it only decides which day's windows are SHOWN.
 *
 * ⚠ ONE RADIO GROUP ACROSS BOTH SECTIONS — the order has one window, so choosing one on Thursday
 * un-chooses today's. Arrow keys and the screen-reader's "2 of 5" come from the platform.
 *
 * ⚠ Lists and tabs inside a section — no cards (Principle V).
 */
export function EffyWindowOptions({
  windows,
  chosen,
  onChoose,
  currency,
  disabled = false,
  now = new Date(),
}: {
  windows: EffyWindowsDTO
  chosen: ChosenWindow | null
  onChoose: (next: ChosenWindow) => void
  currency: string
  disabled?: boolean
  /** Injected for tests; a window is greyed out once its cutoff has passed. */
  now?: Date
}) {
  const group = useId()
  const view = effyWindowsView(windows, now)
  const { today, later } = view
  // Which later day's windows are shown: the one the shopper opened, else the chosen window's day,
  // else the first that has any.
  const [tab, setTab] = useState<string | null>(null)
  const shown =
    later.find((d) => d.date === tab) ??
    later.find((d) => d.date === chosen?.date) ??
    later.find((d) => d.windows.length > 0) ??
    later[0] ??
    null
  // A re-quote can take the opened day away (midnight passed); fall back rather than show nothing.
  const tabGone = tab !== null && !later.some((d) => d.date === tab)
  useEffect(() => {
    if (tabGone) setTab(null)
  }, [tabGone])

  if (view.unavailable) {
    return (
      <section aria-label="Delivery">
        <h2 className="mb-3 text-xl font-semibold">{DELIVERY_TYPE_WORDS.effy}</h2>
        <p role="status" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          {view.unavailable}
        </p>
      </section>
    )
  }

  const windowList = (day: EffyDayView) => (
    <div className="mt-2 divide-y rounded-lg border">
      {day.windows.map((w) => {
        const selected = chosen?.slotId === w.slotId && chosen.date === w.date
        return (
          <label
            key={`${w.date}-${w.slotId}`}
            className={
              "flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm " +
              (w.closed ? "cursor-not-allowed opacity-50" : "cursor-pointer")
            }
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={`${group}-window`}
                value={`${w.date}|${w.slotId}`}
                checked={selected}
                // Greyed out the moment its cutoff passes, without waiting for a re-quote. The server
                // refuses it regardless; this only spares the shopper finding out at the pay button.
                disabled={w.closed}
                onChange={() => onChoose({ slotId: w.slotId, date: w.date })}
              />
              <span>
                <span className="font-medium">{w.label}</span>
                {w.note ? <span className="ml-2 text-muted-foreground">{w.note}</span> : null}
              </span>
            </span>
            {/* 077 FR-030 — what this window adds, BEFORE it is chosen. Nothing when it adds nothing. */}
            {w.surchargeAmount ? (
              <span className="font-medium">+{formatMoney(formatCents(parseCents(w.surchargeAmount)), currency)}</span>
            ) : null}
          </label>
        )
      })}
    </div>
  )

  return (
    <section aria-label="Delivery">
      <h2 className="mb-3 text-xl font-semibold">{DELIVERY_TYPE_WORDS.effy}</h2>

      {today ? (
        <fieldset disabled={disabled}>
          <legend className="text-sm font-medium">{view.sameDayTitle}</legend>
          {today.sentence ? <p className="mt-1 text-sm text-muted-foreground">{today.sentence}</p> : windowList(today)}
        </fieldset>
      ) : null}

      {shown ? (
        <fieldset disabled={disabled} className="mt-6">
          <legend className="text-sm font-medium">{view.standardTitle}</legend>
          <div role="tablist" aria-label="Delivery day" className="mt-2 flex flex-wrap gap-2">
            {later.map((d) => {
              const selected = d.date === shown.date
              return (
                <button
                  key={d.date}
                  type="button"
                  role="tab"
                  id={`${group}-tab-${d.date}`}
                  aria-selected={selected}
                  aria-controls={`${group}-panel`}
                  onClick={() => setTab(d.date)}
                  className={
                    "min-h-11 rounded-md border px-3 text-sm font-medium transition-colors " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 " +
                    (selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")
                  }
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" id={`${group}-panel`} aria-labelledby={`${group}-tab-${shown.date}`}>
            {shown.sentence ? <p className="mt-2 text-sm text-muted-foreground">{shown.sentence}</p> : windowList(shown)}
          </div>
        </fieldset>
      ) : null}
    </section>
  )
}
