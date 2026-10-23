/** RFC 9457 problem+json: the platform's one machine-readable error shape. */
export interface ProblemFieldIssue {
  /**
   * The offending field path, or for a whole-request refusal a stable machine-readable code (e.g.
   * `cap_below_floor`, `bands_required`), so the client can say which rule was broken.
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
  /** Field issues (the wire key is `errors`). */
  errors?: ProblemFieldIssue[];
  /** A stable refusal code where the route defines one (e.g. `slot_required`), mapped by the client to its own copy; `detail` is prose. */
  code?: string;
  [key: string]: unknown;
}
