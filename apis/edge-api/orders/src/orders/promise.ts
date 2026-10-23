// Derived on read, never stored (a stored due date goes stale when pickup days change). Pure; every
// date arrives as a Melbourne `yyyy-mm-dd` from Postgres, and ISO dates compare as text.

export interface PromiseFacts {
  /** A courier order was told an estimate and promised no day. */
  deliveredBy: "effy" | "courier";
  /** null while unpaid. */
  placedDate: string | null;
  /** null for a courier order. */
  promisedDate: string | null;
  /** The end of the window the package was sold, or null. */
  windowEnd: Date | null;
  today: string;
  /** null until handed to the carrier. */
  handoffDate: string | null;
  arrivedAt: Date | null;
  arrivalDate: string | null;
  /**
   * For a courier order: the service's next pickup after the parcel can reach the hub, which is when it
   * is due out. Null for a supplier pickup or a service with no pickup days: then due the day placed.
   */
  courierDueOut?: Date | null;
  /** Judges lateness by the instant, not the day. */
  handoffAt?: Date | null;
  now?: Date;
}

export interface PromiseVerdict {
  handoverDueOn: string | null;
  atRisk: boolean;
  onTime: boolean | null;
}

function melbourneDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(at);
}

export function judgePromise(f: PromiseFacts): PromiseVerdict {
  // Only a courier's package is handed over. Late means past its pickup instant.
  const courier = f.deliveredBy === "courier";
  const byPickup = courier && f.courierDueOut ? f.courierDueOut : null;
  const handoverDueOn = !courier ? null : byPickup ? melbourneDay(byPickup) : f.placedDate;

  // At risk: due out and not left (or left late). An arrived package is never at risk.
  let atRisk = false;
  if (byPickup && f.arrivedAt === null) {
    const left = f.handoffAt ?? null;
    atRisk = left === null ? (f.now ?? new Date()).getTime() > byPickup.getTime() : left.getTime() > byPickup.getTime();
  } else if (handoverDueOn !== null && f.arrivedAt === null) {
    atRisk = f.handoffDate === null ? f.today > handoverDueOn : f.handoffDate > handoverDueOn;
  }

  // Null, not false, when there is nothing to judge (a courier order has no promised day).
  let onTime: boolean | null = null;
  if (f.arrivedAt !== null) {
    if (f.windowEnd !== null) onTime = f.arrivedAt.getTime() <= f.windowEnd.getTime();
    else if (f.promisedDate !== null && f.arrivalDate !== null) onTime = f.arrivalDate <= f.promisedDate;
  }

  return { handoverDueOn, atRisk, onTime };
}
