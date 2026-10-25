"use client"

import { ChevronDown, Clock } from "lucide-react"
import { useId, useState } from "react"

import {
  DELIVERY_TYPE_WORDS,
  DELIVERY_WINDOW_WORDS,
  effyWindowsView,
  type EffyDayView,
  type EffyWindowLine,
  type EffyWindowsDTO,
} from "@effy/shared-types"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { formatCents, parseCents } from "@/lib/cart-totals"
import { isAsap, windowOf, type DeliveryChoice } from "@/lib/delivery-choice"
import { formatMoney } from "@/lib/money"

/**
 * When an Effy-delivered order arrives: one choice for the whole order. "Same-day delivery" lists
 * today's open windows with their order-by times; "Standard delivery" lists "Standard" (as soon as
 * possible) and the next delivery days, a day being a complete choice, with an optional "Need a specific
 * time?" under the chosen day. All one radio group; a time is a nested group under its day. The words are
 * `effyWindowsView`'s and `DELIVERY_WINDOW_WORDS`' (the app's Kotlin twin uses the same fixture). The
 * checkout decides the initial choice; the only local state is the day tapped when its untimed room is
 * gone. Lists, not cards.
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
  chosen: DeliveryChoice | null
  onChoose: (next: DeliveryChoice | null) => void
  currency: string
  disabled?: boolean
  /** Injected for tests; a window is greyed out once its cutoff has passed. */
  now?: Date
}) {
  const group = useId()
  const view = effyWindowsView(windows, now)
  const { today, later } = view

  // A day the shopper tapped that cannot be bought without a time — nothing is chosen yet.
  const [pendingDay, setPendingDay] = useState<string | null>(null)
  // "Need a specific time?" opened under a day that can be bought without one.
  const [timeOpen, setTimeOpen] = useState(false)

  const chosenWindow = windowOf(chosen)
  const chosenLater = chosenWindow ? (later.find((d) => d.date === chosenWindow.date) ?? null) : null
  // The day that is checked: the chosen window's, or the one waiting for a time.
  const activeDay = chosenLater ?? (chosen ? null : (later.find((d) => d.date === pendingDay) ?? null))
  const timedOnActive = !!activeDay && !!chosenWindow && activeDay.anyTime?.slotId !== chosenWindow.slotId
  // The time list is open when a time is chosen, when the shopper opened it, or when the day has no
  // other way to be bought.
  const timesShown = !!activeDay && (timedOnActive || timeOpen || !activeDay.anyTime)

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

  const optionClass = (selected: boolean, closed = false) =>
    "flex min-h-14 cursor-pointer flex-col justify-center rounded-md border px-3 py-2 text-sm shadow-xs " +
    (closed
      ? "cursor-not-allowed border-dashed bg-muted text-muted-foreground shadow-none"
      : selected
        ? "border-primary bg-primary-muted"
        : "hover:bg-accent")

  /** One window as a radio row. The radio is visually hidden but is the control; the label is the hit area. */
  const windowRow = (w: EffyWindowLine, name: string, onPick: () => void) => {
    const selected = chosenWindow?.slotId === w.slotId && chosenWindow.date === w.date
    return (
      <label key={`${w.date}-${w.slotId}`} className={optionClass(selected, w.closed)}>
        <input
          type="radio"
          name={name}
          value={`${w.date}|${w.slotId}`}
          checked={selected}
          disabled={w.closed}
          onChange={onPick}
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
  }

  const grid = "mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4"
  const whenName = `${group}-when`

  const pickToday = (w: EffyWindowLine) => {
    setPendingDay(null)
    setTimeOpen(false)
    onChoose({ slotId: w.slotId, date: w.date })
  }

  const pickDay = (d: EffyDayView) => {
    setTimeOpen(false)
    if (d.anyTime) {
      setPendingDay(null)
      onChoose(d.anyTime)
    } else {
      // No way to buy this day without a time: nothing is chosen until one is.
      setPendingDay(d.date)
      onChoose(null)
    }
  }

  const pickAsap = () => {
    setPendingDay(null)
    setTimeOpen(false)
    onChoose({ asap: true })
  }

  const toggleTimes = (d: EffyDayView) => {
    if (timesShown) {
      setTimeOpen(false)
      // Closing it lets go of a time: the day alone is the choice again.
      if (timedOnActive && d.anyTime) onChoose(d.anyTime)
    } else {
      setTimeOpen(true)
    }
  }

  /** The chosen day's line under it, and its optional times. */
  const dayDetail = (d: EffyDayView) => {
    const timesId = `${group}-times-${d.date}`
    return (
      <div className="mt-3 min-w-0">
        {d.anyTime ? (
          <>
            {timedOnActive ? null : <p className="text-sm text-muted-foreground">{DELIVERY_WINDOW_WORDS.anyTimeDay}</p>}
            {d.windows.length > 0 ? (
              <button
                type="button"
                aria-expanded={timesShown}
                aria-controls={timesId}
                onClick={() => toggleTimes(d)}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
              >
                {DELIVERY_WINDOW_WORDS.timeOptionOpen}
                <ChevronDown aria-hidden="true" className={"size-4 transition-transform " + (timesShown ? "rotate-180" : "")} />
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{DELIVERY_WINDOW_WORDS.timeRequired}</p>
        )}
        {timesShown && d.windows.length > 0 ? (
          <fieldset id={timesId} data-testid="day-times" className="mt-1 min-w-0">
            {/* The day is already named by the checked day above; say it again only to a screen reader. */}
            <legend className={d.anyTime ? "text-xs text-muted-foreground" : "sr-only"}>
              {d.anyTime ? DELIVERY_WINDOW_WORDS.timeOptionHint : d.label}
            </legend>
            <div className={grid}>
              {d.windows.map((w) => windowRow(w, `${group}-time`, () => onChoose({ slotId: w.slotId, date: w.date })))}
            </div>
          </fieldset>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-label="Delivery">
      <h2 className="text-lg font-semibold">
        <span aria-hidden="true">2. </span>
        {DELIVERY_TYPE_WORDS.effy}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose one delivery option for the whole order.</p>

      {today ? (
        <fieldset disabled={disabled} className="mt-5 min-w-0">
          <legend className="flex items-center gap-2 text-sm font-medium">
            {/* Decoration: the legend's name is the pinned title alone. */}
            <Badge variant="dark" aria-hidden="true">
              <Clock />
              Today
            </Badge>
            {view.sameDayTitle}
          </legend>
          {today.sentence ? (
            <p className="mt-2 text-sm text-muted-foreground">{today.sentence}</p>
          ) : (
            <div className={grid}>{today.windows.map((w) => windowRow(w, whenName, () => pickToday(w)))}</div>
          )}
        </fieldset>
      ) : null}

      {later.length > 0 || view.asap ? (
        <fieldset disabled={disabled} className={today ? "mt-6 min-w-0 border-t pt-6" : "mt-5 min-w-0"}>
          <legend className="text-sm font-medium">{view.standardTitle}</legend>
          {/* "Standard" and the three days: one row from tablet width up (two a row on a phone). */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {/* "Standard" is the first tile of the row, named the way most shops name it: the word
                and how long it usually takes. The days after it are the same question's other answers. */}
            {view.asap ? (
              <label className={optionClass(isAsap(chosen))}>
                <input type="radio" name={whenName} value="asap" checked={isAsap(chosen)} onChange={pickAsap} className="sr-only" />
                <span className="font-medium">{view.asap.title}</span>
                {/* The business's own estimate, as it wrote it — an estimate, never a day. */}
                <span className="text-xs text-muted-foreground">{view.asap.estimate}</span>
              </label>
            ) : null}
            {later.map((d) => {
              const selected = activeDay?.date === d.date
              const unavailable = !d.anyTime && d.windows.length === 0
              return (
                <DayRow
                  key={d.date}
                  day={d}
                  name={whenName}
                  selected={selected}
                  unavailable={unavailable}
                  className={optionClass(selected, unavailable)}
                  onPick={() => pickDay(d)}
                />
              )
            })}
          </div>
          {/* What a chosen day means sits below the row, so the row never moves: its "any time" line
              and its optional times. */}
          {activeDay ? dayDetail(activeDay) : null}
        </fieldset>
      ) : null}
    </section>
  )
}

/** One later day as a radio tile. */
function DayRow({
  day,
  name,
  selected,
  unavailable,
  className,
  onPick,
}: {
  day: EffyDayView
  name: string
  selected: boolean
  unavailable: boolean
  className: string
  onPick: () => void
}) {
  return (
    <label className={className}>
      <input type="radio" name={name} value={day.date} checked={selected} disabled={unavailable} onChange={onPick} className="sr-only" />
      <span className={"font-medium " + (unavailable ? "line-through" : "")}>{day.label}</span>
      {unavailable && day.sentence ? <span className="text-xs">{day.sentence}</span> : null}
    </label>
  )
}
