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
  fields?: ProblemFieldIssue[];
  [key: string]: unknown;
}
