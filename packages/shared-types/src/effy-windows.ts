/**
 * The delivery-window picker, as words: the website renders what `effyWindowsView` returns and the
 * customer app has a Kotlin twin pinned to `effy-windows.fixtures.json`. Money is not formatted here:
 * a surcharge leaves as its 2-dp amount.
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
  /** What to send as `deliveryWindow` to choose the day with no time; null when it cannot be (always, today). */
  anyTime: { slotId: string; date: string } | null;
}

export interface EffyWindowsView {
  /** The one sentence when no day has a window; the sections are then not shown. */
  unavailable: string | null;
  sameDayTitle: string;
  standardTitle: string;
  /** Today, under "Same-day delivery". */
  today: EffyDayView | null;
  /** The following delivery days, under "Standard delivery". */
  later: EffyDayView[];
  /** "As soon as possible", when offered. */
  asap: { title: string; hint: string; estimate: string } | null;
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
    anyTime: !today && day.anyTime ? { slotId: day.anyTime.slotId, date: day.anyTime.date } : null,
    windows: day.windows.map((w) => {
      const closed = now.getTime() > new Date(w.cutoffAt).getTime();
      return {
        slotId: w.slotId,
        date: w.date,
        label: formatDeliveryWindow({ startAt: w.startAt, endAt: w.endAt }),
        // The order-by time is today's business; a later day's would be noise.
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
    asap: w.asap
      ? { title: DELIVERY_WINDOW_WORDS.asapTitle, hint: DELIVERY_WINDOW_WORDS.asapHint, estimate: w.asap.estimate }
      : null,
  };
}
