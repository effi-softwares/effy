"use client"

import { Clock } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { DELIVERY_TYPE_WORDS, effyWindowsView, type EffyDayView, type EffyWindowsDTO } from "@effy/shared-types"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
        <h2 className="text-lg font-semibold">
          <span aria-hidden="true">2. </span>
          {DELIVERY_TYPE_WORDS.effy}
        </h2>
        <Alert variant="muted" live className="mt-4">
          {view.unavailable}
        </Alert>
      </section>
    )
  }

  /**
   * A day's windows as radio CARDS. The radio itself is visually hidden but still the control: the
   * label is the hit area, arrow keys move within the group, and a closed window is a disabled radio —
   * shown, struck through, and not choosable.
   */
  const windowList = (day: EffyDayView) => (
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {day.windows.map((w) => {
        const selected = chosen?.slotId === w.slotId && chosen.date === w.date
        return (
          <label
            key={`${w.date}-${w.slotId}`}
            className={
              "flex min-h-14 flex-col justify-center rounded-md border px-3 py-2 text-sm shadow-xs has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring " +
              (w.closed
                ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground shadow-none"
                : selected
                  ? "cursor-pointer border-primary bg-primary-muted ring-1 ring-primary"
                  : "cursor-pointer hover:bg-accent")
            }
          >
            <input
              type="radio"
              name={`${group}-window`}
              value={`${w.date}|${w.slotId}`}
              checked={selected}
              disabled={w.closed}
              onChange={() => onChoose({ slotId: w.slotId, date: w.date })}
              className="sr-only"
            />
            <span className={"font-medium " + (w.closed ? "line-through" : "")}>{w.label}</span>
            {/* The "·" between the two is drawn in CSS, so the label's text stays exactly the shared
                view's words (`label` + `note` + the surcharge) with nothing typed in between. */}
            <span className="flex flex-wrap text-xs text-muted-foreground">
              {w.note ? <span>{w.note}</span> : null}
              {w.surchargeAmount ? (
                <span className={"tabular-nums " + (w.note ? "before:mx-1 before:content-['·']" : "")}>
                  +{formatMoney(formatCents(parseCents(w.surchargeAmount)), currency)}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )

  return (
    <section aria-label="Delivery">
      <h2 className="text-lg font-semibold">
        <span aria-hidden="true">2. </span>
        {DELIVERY_TYPE_WORDS.effy}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose one window for the whole order.</p>

      {today ? (
        <fieldset disabled={disabled} className="mt-5">
          <legend className="flex items-center gap-2 text-sm font-medium">
            {/* Decoration: the legend's name is the pinned title alone. */}
            <Badge variant="dark" aria-hidden="true">
              <Clock />
              Today
            </Badge>
            {view.sameDayTitle}
          </legend>
          {today.sentence ? <p className="mt-2 text-sm text-muted-foreground">{today.sentence}</p> : windowList(today)}
        </fieldset>
      ) : null}

      {shown ? (
        <fieldset disabled={disabled} className={today ? "mt-6 border-t pt-6" : "mt-5"}>
          <legend className="text-sm font-medium">{view.standardTitle}</legend>
          <div role="tablist" aria-label="Delivery day" className="mt-3 flex flex-wrap gap-2">
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
                    "min-h-11 rounded-md border px-3 text-sm font-medium shadow-xs transition-colors disabled:opacity-50 " +
                    (selected ? "border-primary bg-primary-muted ring-1 ring-primary" : "bg-background hover:bg-accent")
                  }
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" id={`${group}-panel`} aria-labelledby={`${group}-tab-${shown.date}`}>
            {shown.sentence ? <p className="mt-3 text-sm text-muted-foreground">{shown.sentence}</p> : windowList(shown)}
          </div>
        </fieldset>
      ) : null}
    </section>
  )
}
