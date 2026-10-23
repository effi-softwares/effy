// State refusals name their reason, unlike the guard's uniform 403: the caller is already authorized.

export type OrderActionReason =
  /** No such package, or not on an order this service can see. */
  | "not_found"
  /** Not collected yet. */
  | "not_collected"
  /** An Effy driver delivers it today. */
  | "not_standard"
  /** Effy delivers it in a later-day window. */
  | "not_carrier"
  /** No recorded handover. */
  | "no_handoff";

export class OrderActionError extends Error {
  constructor(readonly reason: OrderActionReason) {
    super(`orders: ${reason}`);
    this.name = "OrderActionError";
  }
}

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
  not_carrier: {
    status: 422,
    title: "Delivered by Effy",
    detail:
      "this package was sold a delivery window, so an Effy driver delivers it and it does not pass to an outside carrier",
  },
  no_handoff: {
    status: 409,
    title: "No handover recorded",
    detail:
      "record the handover to the carrier before recording that this package arrived",
  },
};
