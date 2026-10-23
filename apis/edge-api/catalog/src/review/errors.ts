import type { FieldError } from "@effy/edge-shared";

export type ReviewErrorKind = "validation" | "not_found" | "conflict";

/** `conflict`: the item is not what the reviewer saw (edited, or already decided). */
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
