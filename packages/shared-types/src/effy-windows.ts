/**
 * The delivery-window picker, as words (078).
 *
 * ⚠ ONE WORDING, IN ONE PLACE — the same rule as `delivery-window.ts`. The customer website renders
 * exactly what `effyWindowsView` returns, and the customer app carries a Kotlin twin pinned to
 * `effy-windows.fixtures.json`. Two pickers that each render SOMETHING never fail when they disagree
 * about which day is "Fri 9 Oct" or whether a window still shows its surcharge.
 *
 * ⚠ NOTHING HERE FORMATS MONEY. A surcharge leaves as the 2-dp amount it arrived as; each surface
 * formats currency its own way.
 */
import { DELIVERY_WINDOW_WORDS, type EffyDayDTO, type EffyWindowsDTO } from "./delivery";
import { formatDeliveryDay, formatDeliveryWindow, formatMoment } from "./delivery-window";

/** One window as a row of the picker. */
export interface EffyWindowLine {
  slotId: string;
  /** yyyy-mm-dd (Melbourne). With `slotId`, what is sent back as `deliveryWindow`. */
  date: string;
  /** "4 pm – 6 pm". */
  label: string;
  /** Today only: "Order by 2 pm", or "Closed" once that moment has passed. Null on a later day. */
  note: string | null;
  /** Its cutoff has passed since the quote was taken: shown, greyed, and not choosable. */
  closed: boolean;
  /** What it adds to the delivery charge, e.g. "2.00"; null when it adds nothing. */
  surchargeAmount: string | null;
}

/** One day of the picker. */
export interface EffyDayView {
  date: string;
  /** "Thu 8 Oct". */
  label: string;
  /** Why there is nothing to choose that day; null when there is. */
  sentence: string | null;
  windows: EffyWindowLine[];
}

export interface EffyWindowsView {
  /** The one sentence when NO day has a window; the sections are then not shown. */
  unavailable: string | null;
  sameDayTitle: string;
  standardTitle: string;
  /** Today, under "Same-day delivery". */
  today: EffyDayView | null;
  /** The following delivery days, under "Standard delivery". */
  later: EffyDayView[];
}

function sentenceFor(day: EffyDayDTO): string | null {
  if (day.windows.length > 0) return null;
  if (day.closedReason === "not_delivery_day") return DELIVERY_WINDOW_WORDS.todayNotDeliveryDay;
  return day.section === "same_day" ? DELIVERY_WINDOW_WORDS.todayClosed : DELIVERY_WINDOW_WORDS.dayFull;
}

function dayView(day: EffyDayDTO, now: Date): EffyDayView {
  const today = day.section === "same_day";
  return {
    date: day.date,
    label: formatDeliveryDay(day.date),
    sentence: sentenceFor(day),
    windows: day.windows.map((w) => {
      const closed = now.getTime() > new Date(w.cutoffAt).getTime();
      return {
        slotId: w.slotId,
        date: w.date,
        label: formatDeliveryWindow({ startAt: w.startAt, endAt: w.endAt }),
        // The time to order by is today's business; a later day's is days away and would only be noise.
        note: !today ? null : closed ? "Closed" : `${DELIVERY_WINDOW_WORDS.cutoffPrefix} ${formatMoment(w.cutoffAt, now)}`,
        closed,
        surchargeAmount: Number(w.surchargeAmount) > 0 ? w.surchargeAmount : null,
      };
    }),
  };
}

/** What the picker shows for a quote's windows at `now`. Pure. */
export function effyWindowsView(w: EffyWindowsDTO, now: Date): EffyWindowsView {
  const today = w.days.find((d) => d.section === "same_day") ?? null;
  return {
    unavailable: w.unavailable ? DELIVERY_WINDOW_WORDS.noWindows : null,
    sameDayTitle: DELIVERY_WINDOW_WORDS.sectionSameDay,
    standardTitle: DELIVERY_WINDOW_WORDS.sectionStandard,
    today: today ? dayView(today, now) : null,
    later: w.days.filter((d) => d.section === "standard").map((d) => dayView(d, now)),
  };
}
