// What a refund, a cancellation or a refund request can be refused for. None is a transport failure.

/** A missing order and one the caller may not see, deliberately indistinguishable. */
export class RefundOrderNotFoundError extends Error {}

/** More than remains. Carries what remains. */
export class CeilingExceededError extends Error {
  constructor(readonly remainingCents: number) {
    super(`refunds: only ${remainingCents} cents remain refundable`);
  }
}

/** The same unit would be refunded twice. */
export class LineOverRefundedError extends Error {}
export class InvalidReasonError extends Error {}
/** A programming error: no request body can set the actor kind. */
export class InvalidActorKindError extends Error {}
/** A goodwill refund with no note is unaccountable. */
export class NoteRequiredError extends Error {}
/** An item-derived refund computes its own amount; one supplied beside lines is rejected. */
export class AmountRejectedError extends Error {}
export class NoLinesError extends Error {}
export class AmountInvalidError extends Error {}
/** A named line is outside the caller's shop portion. The whole request is refused. */
export class LinesNotYoursError extends Error {}

/** The provider made a decision. Terminal. */
export class ProviderRefusedError extends Error {
  constructor(readonly reason: string, readonly refundId: string) {
    super(`refunds: provider refused: ${reason}`);
  }
}

/** Preparation has begun (or the order was never paid). Staff may still cancel. */
export class NotCancellableError extends Error {}
/** A second cancel of the same order. Idempotent. */
export class AlreadyCancelledError extends Error {}

/** The order already has an unanswered request. */
export class RequestAlreadyOpenError extends Error {}
/** No such request, or one already decided. */
export class RequestNotFoundError extends Error {}
export class MessageRequiredError extends Error {}
