// What a refund, a cancellation or a refund request can be refused for. Each is a fact about the
// request or the order; none is a transport failure.

/** Raised for a missing order AND for one the caller may not see — deliberately indistinguishable. */
export class RefundOrderNotFoundError extends Error {}

/** The amount asked for is more than remains. Carries what remains, so the refusal can say so. */
export class CeilingExceededError extends Error {
  constructor(readonly remainingCents: number) {
    super(`refunds: only ${remainingCents} cents remain refundable`);
  }
}

/** The same unit would be refunded twice. */
export class LineOverRefundedError extends Error {}
export class InvalidReasonError extends Error {}
/** ⚠ A programming error, not an operator one: no request body can set the actor kind. */
export class InvalidActorKindError extends Error {}
/** A goodwill refund with no note is unaccountable. */
export class NoteRequiredError extends Error {}
/** An item-derived refund computes its own amount; one supplied beside lines is REJECTED, not ignored. */
export class AmountRejectedError extends Error {}
export class NoLinesError extends Error {}
export class AmountInvalidError extends Error {}
/** One or more named lines are not part of the caller's own shop portion. The whole request is refused. */
export class LinesNotYoursError extends Error {}

/** The provider made a DECISION. Terminal; the refund row is marked refused. */
export class ProviderRefusedError extends Error {
  constructor(readonly reason: string, readonly refundId: string) {
    super(`refunds: provider refused: ${reason}`);
  }
}

/** Somebody has already begun preparing this order (or it was never paid). Staff may still be able to. */
export class NotCancellableError extends Error {}
/** A second cancel of the same order. Idempotent — not a failure to the caller. */
export class AlreadyCancelledError extends Error {}

/** This order already has an unanswered request (the partial unique index fired). */
export class RequestAlreadyOpenError extends Error {}
/** No such request — or one already decided. */
export class RequestNotFoundError extends Error {}
export class MessageRequiredError extends Error {}
