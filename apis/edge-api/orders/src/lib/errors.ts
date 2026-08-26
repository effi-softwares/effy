// Typed refusals for the orders service (053).
//
// ⚠ EVERY REFUSAL NAMES ITS REASON. That is a deliberate contrast with the guard's uniform 403: an
// AUTHORIZATION refusal must not disclose which term failed, because that turns the route into an
// oracle. A STATE refusal is the opposite — the operator has already proved who they are, and
// "cannot record that" without saying why is how a support ticket gets written (spec FR-006).

/** Why a handover or an arrival could not be recorded. */
export type OrderActionReason =
  /** No such package, or it belongs to no order this service can see. */
  | "not_found"
  /** The package has not been collected yet, so there is nothing to hand over. */
  | "not_collected"
  /** The package is same-day: an Effy driver delivers it, so it takes no carrier handoff. */
  | "not_standard"
  /** An arrival was attempted on a package with no recorded handover (FR-006). */
  | "no_handoff";

export class OrderActionError extends Error {
  constructor(readonly reason: OrderActionReason) {
    super(`orders: ${reason}`);
    this.name = "OrderActionError";
  }
}

/** HTTP status + operator-facing detail for each reason. */
export const ACTION_REFUSALS: Record<
  OrderActionReason,
  { status: number; title: string; detail: string }
> = {
  not_found: {
    status: 404,
    title: "No such package",
    detail: "that package does not exist",
  },
  not_collected: {
    status: 409,
    title: "Not collected yet",
    detail:
      "this package has not been collected from its shop, so there is nothing to hand over or deliver",
  },
  not_standard: {
    status: 422,
    title: "Same-day package",
    detail:
      "this package is delivered by an Effy driver and does not pass to an outside carrier",
  },
  no_handoff: {
    status: 409,
    title: "No handover recorded",
    detail:
      "record the handover to the carrier before recording that this package arrived",
  },
};
