import type { DeliveryExceptionDTO, DeliveryFailureReason } from "@effy/shared-types";

/**
 * ⚠ WORDS A PERSON CAN ACT ON, NOT ENUM VALUES. The wire carries a closed set so the mix is
 * reportable in aggregate; a screen showing `customer_refused` makes the reader translate.
 */
const REASON_LABEL: Record<DeliveryFailureReason, string> = {
  nobody_home: "Nobody home",
  wrong_address: "Wrong address",
  customer_refused: "Customer refused",
  access_blocked: "Access blocked",
  other: "Other",
};

export function reasonLabel(reason: DeliveryFailureReason): string {
  return REASON_LABEL[reason] ?? reason;
}

/**
 * ⚠ THE URGENCY DISTINCTION (FR-020). "The goods are in a van" is a different problem from "they are
 * back at the hub" — one is time-critical and the other is a queue. The list is useless for triage
 * without it, which is why it is derived server-side rather than guessed here.
 */
export function locationLabel(e: DeliveryExceptionDTO): string {
  if (e.packageLocation === "with_driver") return `With ${e.driverName} — to return`;
  // 088 — back at the hub; when, if a return recorded it.
  return e.returnedAt ? `Returned ${new Date(e.returnedAt).toLocaleString()}` : "At hub";
}

/** Open first, then most recent — what someone triaging wants at the top. */
export function sortForTriage(rows: readonly DeliveryExceptionDTO[]): DeliveryExceptionDTO[] {
  return [...rows].sort((a, b) => {
    if ((a.resolvedAt === null) !== (b.resolvedAt === null)) return a.resolvedAt === null ? -1 : 1;
    return b.failedAt.localeCompare(a.failedAt);
  });
}
