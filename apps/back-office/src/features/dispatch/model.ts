import {
  formatDeliveryWindow,
  formatMoment,
  windowStateAt,
  type DeliveryWindow,
  type DeliveryWindowState,
} from "@effy/shared-types";
import type { ExclusionReasonDTO, UnassignedWorkDTO } from "@effy/shared-types";

// Presentation vocabulary for the dispatcher console (063).

/**
 * ⚠ ONE SENTENCE PER REASON, WRITTEN FOR A PERSON WHO HAS TO FIX IT. FR-015 exists so an unassigned
 * package is explainable; a raw enum on screen ("not_cleared") explains nothing to the operator who
 * has to decide whether to grant a clearance or call somebody in.
 */
export const REASON_TEXT: Record<ExclusionReasonDTO, string> = {
  not_on_duty: "Not on duty",
  not_employable: "Stood down or no longer employed",
  licence_expired: "Licence expired",
  no_vehicle: "Holding no vehicle",
  not_cleared: "Not cleared for this work",
  no_refrigeration: "Vehicle cannot carry these goods",
  over_capacity: "Round too heavy for the vehicle",
  cannot_meet_deadline: "Cannot finish in time",
};

/**
 * ⚠ AN EMPTY REASON LIST MEANS SOMETHING DIFFERENT, AND THE SCREEN MUST SAY SO. "Nobody is cleared
 * for this area" is a staffing decision; "everyone cleared failed a condition" is a fixable list.
 * Rendering both as "could not be assigned" would hide which of the two is happening.
 */
export function describeReasons(reasons: ExclusionReasonDTO[]): string {
  if (reasons.length === 0) return "No driver is cleared for this work at all";
  return reasons.map((r) => REASON_TEXT[r]).join(" · ");
}

export function roundLabel(kind: string): string {
  return kind === "collection" ? "Collection" : "Same-day delivery";
}

/**
 * How a drop stands against the window the customer was sold, in words (069 FR-032).
 *
 * ⚠ ONLY FOR A STOP THAT IS STILL TO BE DONE. A finished drop is not "late" on this screen — whether
 * it arrived inside its window is recorded on the order, against the time it actually arrived.
 * "Late" here means "the window has closed and the driver has not been".
 */
export function windowNoteFor(
  stop: { status: string; deliveryWindow?: DeliveryWindow | null },
  now: Date,
): { text: string; state: DeliveryWindowState | "finished" } | null {
  if (!stop.deliveryWindow) return null;
  const text = formatDeliveryWindow(stop.deliveryWindow);
  if (stop.status === "done" || stop.status === "skipped") return { text, state: "finished" };
  return { text, state: windowStateAt(now, stop.deliveryWindow) };
}

/** The word shown beside a window. Empty for one that is neither open nor missed. */
export const WINDOW_STATE_LABEL: Record<DeliveryWindowState | "finished", string> = {
  upcoming: "",
  due: "Due now",
  late: "Late",
  finished: "",
};

/**
 * Whether a round has opened to its driver, in words (072).
 *
 * ⚠ WORK IS NOW ASSIGNED THE MOMENT A DRIVER CAN TAKE IT, so most of what this screen lists in the
 * morning cannot be worked yet. A dispatcher looking at an afternoon round with nothing collected
 * must be able to tell "not started" from "cannot start": this is that difference.
 *
 * `opensAt` is the platform's own derived instant — the same one the driver's app is refused
 * against — and `null` means the round has no opening time at all (a delivery with no window).
 * It is judged against the clock HERE because it changes while the screen is open.
 */
export function roundOpenState(
  round: { opensAt: string | null; status: string },
  now: Date,
): { open: boolean; text: string } {
  if (round.status === "completed" || round.status === "cancelled") return { open: true, text: "" };
  if (round.opensAt === null || new Date(round.opensAt).getTime() <= now.getTime()) {
    return { open: true, text: "Open" };
  }
  return { open: false, text: `Opens ${formatMoment(round.opensAt, now)}` };
}

/** A moment for this console: the time, with the day when it is not today (Melbourne). */
export function momentText(at: string, now: Date): string {
  return formatMoment(at, now);
}

/**
 * Where an unassigned package is waiting and what for (072) — "At the shop · next collection 2 pm".
 *
 * ⚠ A HUB-SIDE PACKAGE IS THE MORE URGENT OF THE TWO, and until 072 it was not on this screen at
 * all: a customer has been sold a window for it. The two stages are said in words, never by colour.
 */
export function waitingFor(item: Pick<UnassignedWorkDTO, "stage" | "targetAt">, now: Date): string {
  if (item.stage === "delivery") {
    return item.targetAt ? `At the hub · deliver by ${formatMoment(item.targetAt, now)}` : "At the hub";
  }
  return item.targetAt
    ? `At the shop · next collection ${formatMoment(item.targetAt, now)}`
    : "At the shop · no collection run is scheduled";
}
