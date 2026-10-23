// What a package was promised, and whether Effy is keeping it (069).
//
// ⚠ EVERYTHING HERE IS DERIVED ON READ AND NOTHING IS STORED (research R6). A stored "due date" would
// go stale the moment an operator changed a courier service's pickup days.
//
// ⚠ PURE, AND GIVEN ITS DATES AS STRINGS. Every date arrives as a Melbourne `yyyy-mm-dd` computed by
// PostgreSQL (`AT TIME ZONE 'Australia/Melbourne'`), so nothing in this file rebuilds a calendar day
// from an instant — the shape 058's two DST defects were made of. ISO dates compare correctly as text.

export interface PromiseFacts {
  /**
   * Who takes it to the customer: the order's delivery type (079). A courier order was told an
   * estimate, promised no day, and is due at the carrier as soon as it can go.
   */
  deliveredBy: "effy" | "courier";
  /** The Melbourne date the order was placed; null while unpaid. */
  placedDate: string | null;
  /** The delivery day the customer was promised; null for a courier order. */
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
  /**
   * 080 — for an order sold as a courier delivery: the courier service's next pickup after the
   * parcel reached (or can reach) the hub — `nextCourierPickup`. It is when the parcel is due out,
   * and it replaces 079's "the day it was placed". Null when there is no pickup to ask about (a
   * supplier pickup, or a service with no pickup days); the parcel is then due out the day it was placed.
   */
  courierDueOut?: Date | null;
  /** 080 — the moment it was handed over, to judge "late" by the instant rather than the day. */
  handoffAt?: Date | null;
  /** 080 — now; with `courierDueOut`. */
  now?: Date;
}

export interface PromiseVerdict {
  handoverDueOn: string | null;
  atRisk: boolean;
  onTime: boolean | null;
}

/** The Melbourne date an instant falls on. */
function melbourneDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(at);
}

export function judgePromise(f: PromiseFacts): PromiseVerdict {
  // Only a courier's package is handed over; one Effy delivers itself never is.
  // ⚠ It is due out by its service's next PICKUP, an instant (080): the day is that instant's, and
  // late is past that instant. With no pickup to ask about it is due out the day it was placed (079).
  const courier = f.deliveredBy === "courier";
  const byPickup = courier && f.courierDueOut ? f.courierDueOut : null;
  const handoverDueOn = !courier ? null : byPickup ? melbourneDay(byPickup) : f.placedDate;

  // At risk: the day it had to leave the hub has gone and it had not left — or it left late.
  // ⚠ An arrived package is never at risk: `onTime` is the verdict from then on, and a list that
  // kept flagging a delivered package would train staff to ignore the flag.
  let atRisk = false;
  if (byPickup && f.arrivedAt === null) {
    const left = f.handoffAt ?? null;
    atRisk = left === null ? (f.now ?? new Date()).getTime() > byPickup.getTime() : left.getTime() > byPickup.getTime();
  } else if (handoverDueOn !== null && f.arrivedAt === null) {
    atRisk = f.handoffDate === null ? f.today > handoverDueOn : f.handoffDate > handoverDueOn;
  }

  // On time: inside the window where one was sold, on or before the promised day otherwise.
  // ⚠ NULL, not false, when there is nothing to judge against: a courier order was promised no day.
  let onTime: boolean | null = null;
  if (f.arrivedAt !== null) {
    if (f.windowEnd !== null) onTime = f.arrivedAt.getTime() <= f.windowEnd.getTime();
    else if (f.promisedDate !== null && f.arrivalDate !== null) onTime = f.arrivalDate <= f.promisedDate;
  }

  return { handoverDueOn, atRisk, onTime };
}
