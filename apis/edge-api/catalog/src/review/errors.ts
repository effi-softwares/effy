import type { FieldError } from "@effy/edge-shared";

export type ReviewErrorKind = "validation" | "not_found" | "conflict";

/**
 * A refusal the reviewer can act on (067).
 *
 * `conflict` is the important one: it means the item is not what the reviewer was looking at — the
 * shop edited it, or a colleague already decided it. Nothing is ever approved that nobody saw.
 */
export class ReviewError extends Error {
  constructor(
    readonly kind: ReviewErrorKind,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
