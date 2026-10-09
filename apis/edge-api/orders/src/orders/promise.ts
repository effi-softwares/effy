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
  /**
   * Who takes it to the customer — `public.package_delivered_by` (079). ⚠ Not the method: a
   * "standard" package sold a window is Effy's, and this file is not where that is decided.
   */
  deliveredBy: "effy" | "courier";
  /**
   * The ORDER was sold as a courier delivery (079): told an estimate, promised no day, and due at
   * the carrier as soon as it can go. False for every order placed before 079.
   */
  courierOrder: boolean;
  /** The Melbourne date the order was placed; null while unpaid. */
  placedDate: string | null;
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
  /**
   * 080 — for an order sold as a courier delivery: the courier service's next pickup after the
   * parcel reached (or can reach) the hub — `nextCourierPickup`. It is when the parcel is due out,
   * and it replaces 079's "the day it was placed". Null when there is no service to ask (an order
   * from before 080), and then 079's rule stands.
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

/** `isoDate` minus `days`, as pure calendar arithmetic. */
export function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function judgePromise(f: PromiseFacts): PromiseVerdict {
  // Only a courier's package is handed over; one Effy delivers itself never is.
  // Due: the promised day less the carrier's lead time (069). ⚠ An order sold as a courier delivery
  // (079) was promised no day — it is due out the day it was placed. A package from before 069 has
  // neither, and nothing to be late against.
  // ⚠ 080 — a courier order with a service is due out by that service's next PICKUP, an instant:
  // the day is that instant's, and late is past that instant.
  const byPickup = f.deliveredBy === "courier" && f.courierOrder && f.courierDueOut ? f.courierDueOut : null;
  const handoverDueOn = f.deliveredBy !== "courier"
    ? null
    : byPickup
      ? melbourneDay(byPickup)
      : f.promisedDate !== null
        ? minusDays(f.promisedDate, f.carrierLeadDays)
        : f.courierOrder ? f.placedDate : null;

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
  // ⚠ NULL, not false, when there is nothing to judge against. An order placed before 069 was
  // promised no day; calling it late would be inventing a promise in order to have broken it.
  let onTime: boolean | null = null;
  if (f.arrivedAt !== null) {
    if (f.windowEnd !== null) onTime = f.arrivedAt.getTime() <= f.windowEnd.getTime();
    else if (f.promisedDate !== null && f.arrivalDate !== null) onTime = f.arrivalDate <= f.promisedDate;
  }

  return { handoverDueOn, atRisk, onTime };
}
