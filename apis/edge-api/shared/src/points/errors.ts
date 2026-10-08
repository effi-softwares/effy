// What a points change can be refused for (074). Each is a fact about the request or the balance; none
// is a transport failure. Services map them to problems; the shared module never speaks HTTP.

/** Not a whole number of points between 1 and the ceiling. */
export class PointsInvalidError extends Error {}

/** A reason that does not belong to this kind of change. */
export class PointsReasonInvalidError extends Error {}

/** Reason `other` with no note: unaccountable. */
export class PointsNoteRequiredError extends Error {}

/**
 * Raised for a missing order AND for another customer's — deliberately indistinguishable, so the
 * refusal is not an oracle for which order ids exist (FR-010).
 */
export class PointsOrderNotFoundError extends Error {}

/** A debit, a hold or a spend asked for more than is usable now. Carries what IS usable. */
export class InsufficientPointsError extends Error {
  constructor(readonly usable: number) {
    super(`points: only ${usable} usable`);
  }
}

/** A customer-service agent asked to credit more than the per-credit limit (FR-007). */
export class OverAgentLimitError extends Error {
  constructor(readonly limit: number) {
    super(`points: agent limit is ${limit}`);
  }
}

/** A setting outside its allowed range (data-model.md). */
export class PointsSettingInvalidError extends Error {
  constructor(readonly field: string) {
    super(`points: setting ${field} out of range`);
  }
}
