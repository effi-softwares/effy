/** RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 *  docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 *  consumes it, never re-declares it. */
export interface ProblemFieldIssue {
  /**
   * The offending field path — or, for a whole-request refusal, a STABLE MACHINE-READABLE CODE.
   *
   * ⚠ 032 uses the second form for delivery-pricing refusals (`cap_below_floor`,
   * `bands_required`, …). "Please check the fields and try again" tells an operator nothing about
   * which of five rules they broke, and every one of those rules fails SILENTLY in production if it
   * is not understood — a cap below the floor makes every delivery cost the cap, forever.
   */
  field: string;
  message: string;
}

export interface ProblemJSON {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /**
   * ⚠ THE WIRE KEY IS `errors`. `@effy/edge-shared`'s `problem()` has always serialised field issues
   * under `errors`; `fields` was the name only this type used, so every reader keying off it saw
   * nothing. Both are declared so the mismatch is visible here rather than rediscovered per surface
   * (053 found it; 054 fixed the reader in `@effy/api-client`).
   */
  errors?: ProblemFieldIssue[];
  /** @deprecated The wire uses `errors`. Kept so older readers still compile. */
  fields?: ProblemFieldIssue[];
  [key: string]: unknown;
}
