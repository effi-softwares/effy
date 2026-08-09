// Domain types for the home layout slice (042).
//
// ⚠ THE BLOCK TYPES ARE IMPORTED, NEVER RE-DECLARED. `promotions/types.ts` re-declares
// `BannerPlacement` locally today, which is exactly the drift Principle II forbids: two definitions
// of one contract always eventually disagree, and the one that disagrees silently is the one nobody
// is looking at. `@effy/shared-types` is the single source for the catalogue, the field schema and
// the layout body; this file adds only what is local to authoring.
import type { LayoutBlock, LayoutBody } from "@effy/shared-types";

export type { LayoutBlock, LayoutBody };

/** The layout as this service holds it — both bodies plus the concurrency and provenance fields. */
export interface HomeLayout {
  draft: LayoutBody;
  published: LayoutBody;
  revision: number;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** One field-level problem, surfaced to the operator against the block and field that caused it. */
export interface LayoutIssue {
  /** The block's id, so the composer can scroll to it rather than saying "something is wrong". */
  blockId: string;
  /** Dotted path within the block's props, e.g. `tiles.0.headline`. Empty for a whole-block problem. */
  field: string;
  code: string;
  message: string;
}

/**
 * A refusal, carrying everything the operator needs to fix it.
 *
 * ⚠ REFUSALS ARE SERVER-SIDE AND THAT IS THE POINT (FR-032). A check that exists only in the
 * composer's form is not a check — the operator can reach this API directly, and the storefront is
 * what has to live with whatever gets stored. The form's copy of these rules is advisory.
 */
export class LayoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: LayoutIssue[] = [],
  ) {
    super(message);
    this.name = "LayoutError";
  }
}

export function isLayoutError(err: unknown): err is LayoutError {
  return err instanceof LayoutError;
}

/**
 * ⚠ A STALE WRITE IS A DISTINCT OUTCOME, NOT A GENERIC FAILURE (FR-017). Two members of staff editing
 * the home page is ordinary; one silently discarding the other's work is not. The repository writes
 * conditionally on the revision the client last read, and zero rows affected means exactly this —
 * which the operator can act on ("reload and reapply") in a way that "save failed" does not support.
 */
export function conflict(): LayoutError {
  return new LayoutError(
    409,
    "layout_revision_conflict",
    "someone else changed the layout since you loaded it — reload and reapply your change",
  );
}
