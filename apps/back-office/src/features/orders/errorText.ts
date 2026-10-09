import { isDomainError } from "@effy/api-client";

/**
 * Uniform, non-leaking failure copy for the order console's two write actions.
 *
 * ⚠ THIS FILE EXISTS BECAUSE THE FIRST DRAFT SILENTLY SWALLOWED EVERY REFUSAL. It did:
 *
 *     onError: (e) => setActionError(e instanceof Error ? e.message : "Could not record that.")
 *
 * `@effy/api-client` throws a `DomainError` — a plain object, NOT an `Error` instance — so the
 * `instanceof` check was always false and the operator ALWAYS saw the generic fallback. Spec FR-006
 * requires the refusal to name the missing handover; the server said so correctly and the console
 * threw it away. Green tests throughout: nothing asserted on the message.
 *
 * ⚠ AND THE FIX IS NOT "RENDER `detail`". `DomainError.detail` is free-form server prose that can
 * leak internals — 005's FR-008 forbids it, and the `ErrorState` contract applies the same rule to
 * inline form errors. The copy below is the CONSOLE'S OWN, keyed off `kind`, `status` and which
 * action was attempted.
 *
 * ⚠ Why the action is a parameter rather than a refusal code from the server: the platform's stable
 * refusal codes travel in `ProblemJSON.fields`, and `@effy/edge-shared`'s `problem()` serialises them
 * under `errors` instead — so `DomainError.fields` is always undefined today (see SIGNOFF). The
 * caller already knows which button it pressed, which is enough to say something useful.
 */
export function orderActionError(err: unknown, action: "handoff" | "arrival"): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden")
      return "Recording this needs a manager or an administrator.";
    if (err.kind === "not-found") return "That package no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";

    if (err.status === 409) {
      return action === "handoff"
        ? "This package hasn't been collected from its shop yet, so there's nothing to hand over."
        : "This package isn't ready to be marked as arrived. Record the handover first — and if you already did, refresh: it may have changed since this page loaded.";
    }

    // The only 422 either route emits: a same-day package cannot take a carrier handover.
    if (err.status === 422)
      return "An Effy driver delivers this package, so there's no carrier handover to record.";

    if (err.status === 400) return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

/** 080 — the server's refusal codes for courier consignments, in the console's own words. */
const CONSIGNMENT_COPY: Record<string, string> = {
  not_courier: "Effy delivers this package — there is no courier to book.",
  service_unavailable: "That courier service is no longer in use. Choose another.",
  service_not_supplier: "That courier service does not collect from suppliers. Choose one that does.",
  consignment_handed_over: "The parcel is already with the courier; its service can no longer change.",
  not_booked: "Book the consignment first.",
  invalid_step: "That step does not follow from where the parcel is now. Refresh and try again.",
  collection_locked: "A parcel of this order has already left, so how it reaches the courier can no longer change.",
  collection_assigned: "A driver is assigned to collect a parcel of this order. Unassign them (below, under Packages) first.",
  pickup_in_past: "The pickup day has passed. Choose today or later.",
  invalid_consignment: "Check the booking: a tracking link starts with https://, and a pickup window needs a start and a later end.",
  not_collected: "A driver has not brought this package to the hub yet.",
};

export function consignmentError(err: unknown): string {
  if (isDomainError(err)) {
    const code = (err as { code?: string }).code;
    if (code && CONSIGNMENT_COPY[code]) return CONSIGNMENT_COPY[code];
    if (err.kind === "forbidden") return "Recording this needs a manager or an administrator.";
  }
  if (err instanceof Error && err.message === "the label could not be uploaded") return "The label could not be uploaded. Try again.";
  return "That could not be saved. Try again.";
}
