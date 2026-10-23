// What a points change can be refused for. Services map them to problems; this module never speaks HTTP.

/** Not a whole number of points between 1 and the ceiling. */
export class PointsInvalidError extends Error {}

/** A reason that does not belong to this kind of change. */
export class PointsReasonInvalidError extends Error {}

/** Reason `other` with no note: unaccountable. */
export class PointsNoteRequiredError extends Error {}

/** A missing order and another customer's, indistinguishable so the refusal is not an oracle. */
export class PointsOrderNotFoundError extends Error {}

/** A debit, hold or spend for more than is usable now. Carries what is usable. */
export class InsufficientPointsError extends Error {
  constructor(readonly usable: number) {
    super(`points: only ${usable} usable`);
  }
}

/** An agent asked to credit more than the per-credit limit. */
export class OverAgentLimitError extends Error {
  constructor(readonly limit: number) {
    super(`points: agent limit is ${limit}`);
  }
}

/** A setting outside its allowed range. */
export class PointsSettingInvalidError extends Error {
  constructor(readonly field: string) {
    super(`points: setting ${field} out of range`);
  }
}
