// What a package was promised, and whether Effy is keeping it (069).
//
// ⚠ EVERYTHING HERE IS DERIVED ON READ AND NOTHING IS STORED (research R6). A stored "due date" would
// go stale the moment an operator changed the carrier lead time, and the handover list would then
// disagree with the setting the same operator can see on the Delivery days tab.
//
// ⚠ PURE, AND GIVEN ITS DATES AS STRINGS. Every date arrives as a Melbourne `yyyy-mm-dd` computed by
// PostgreSQL (`AT TIME ZONE 'Australia/Melbourne'`), so nothing in this file rebuilds a calendar day
// from an instant — the shape 058's two DST defects were made of. ISO dates compare correctly as text.

export interface PromiseFacts {
  /** "same_day" | "standard" | null for a pre-047 package. */
  method: string | null;
  /** The delivery day the customer was promised. Null for every order placed before 069. */
  promisedDate: string | null;
  /** The end of the window the package was sold — same-day, or since 078 a later day's — or null. */
  windowEnd: Date | null;
  /** Today in Melbourne. */
  today: string;
  /** The Melbourne date the package was handed to the carrier, or null if it has not been. */
  handoffDate: string | null;
  /** When it arrived, or null if it has not. */
  arrivedAt: Date | null;
  /** The Melbourne date it arrived, or null. */
  arrivalDate: string | null;
  /** Hub handover → delivered, in days. A stated assumption until there is a carrier contract. */
  carrierLeadDays: number;
}

export interface PromiseVerdict {
  handoverDueOn: string | null;
  atRisk: boolean;
  onTime: boolean | null;
}

/** `isoDate` minus `days`, as pure calendar arithmetic. */
export function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function judgePromise(f: PromiseFacts): PromiseVerdict {
  // ⚠ 078 — a standard package that was sold a WINDOW is delivered by Effy on its day; only one
  // with no window goes to a carrier. The window is the fact; the method is the customer's word.
  const carrier = f.method === "standard" && f.promisedDate !== null && f.windowEnd === null;

  // Only a carrier package is handed over; anything with a window is Effy's own driver's.
  const handoverDueOn = carrier ? minusDays(f.promisedDate!, f.carrierLeadDays) : null;

  // At risk: the day it had to leave the hub has gone and it had not left — or it left late.
  // ⚠ An arrived package is never at risk: `onTime` is the verdict from then on, and a list that
  // kept flagging a delivered package would train staff to ignore the flag.
  let atRisk = false;
  if (handoverDueOn !== null && f.arrivedAt === null) {
    atRisk = f.handoffDate === null ? f.today > handoverDueOn : f.handoffDate > handoverDueOn;
  }

  // On time: inside the window where one was sold, on or before the promised day otherwise.
  // ⚠ NULL, not false, when there is nothing to judge against. An order placed before 069 was
  // promised no day; calling it late would be inventing a promise in order to have broken it.
  let onTime: boolean | null = null;
  if (f.arrivedAt !== null) {
    if (f.windowEnd !== null) onTime = f.arrivedAt.getTime() <= f.windowEnd.getTime();
    else if (f.promisedDate !== null && f.arrivalDate !== null) onTime = f.arrivalDate <= f.promisedDate;
  }

  return { handoverDueOn, atRisk, onTime };
}
