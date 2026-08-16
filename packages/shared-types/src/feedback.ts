/**
 * Customer feedback (046) — the shared SSOT for the feedback listening channel.
 *
 * Contract: `specs/046-customer-feedback/contracts/feedback-api.contract.md`.
 *
 * Imported by the storefront form, the customer-mobile slice, the two edge services, and the
 * back-office console. Nothing here is redefined on either side (Principle II) — most importantly the
 * length bounds, so the form, the service validators, and the DB CHECK cannot disagree (U1).
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fixed vocabularies (research D3). Small closed unions keep the queue triageable and the filters
// finite; the DB mirrors each with a CHECK constraint.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type FeedbackCategory = "bug" | "suggestion" | "complaint" | "compliment" | "other";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "bug",
  "suggestion",
  "complaint",
  "compliment",
  "other",
];

/** Human labels — the ONE place a category becomes prose (clients import these, never re-spell them). */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Something's broken",
  suggestion: "A suggestion",
  complaint: "A complaint",
  compliment: "A compliment",
  other: "Something else",
};

/**
 * Triage state. `new` on insert; `replied` is SYSTEM-set when a reply email succeeds (never a direct
 * staff choice); the rest are staff-set. `spam` hides a row from the default view without deleting it.
 */
export type FeedbackStatus =
  | "new"
  | "in_review"
  | "replied"
  | "resolved"
  | "archived"
  | "spam";

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  in_review: "In review",
  replied: "Replied",
  resolved: "Resolved",
  archived: "Archived",
  spam: "Spam",
};

/** The statuses a staff member may set directly. `replied` is deliberately absent (system-set). */
export const FEEDBACK_SETTABLE_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "in_review",
  "resolved",
  "archived",
  "spam",
];

/** Where the submission originated (FR-011). */
export type FeedbackSource = "checkout" | "general" | "other";

/** Which surface it came from. */
export type FeedbackPlatform = "web" | "ios" | "android";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Length bounds — ONE source of truth (U1). The DB CHECK, the service validators, the web form, and
// the mobile screen all consume these. Change here and in the migration together.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const FEEDBACK_MESSAGE_MAX = 5000;
export const FEEDBACK_REPLY_MAX = 5000;
export const FEEDBACK_NOTE_MAX = 2000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Submission (customer surfaces → edge-customer).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The submit request body. `email`/`name` are honoured ONLY on the public (guest) route — the
 * authenticated route takes the trusted email from the verified profile and ignores a body email.
 */
export interface SubmitFeedbackRequest {
  category: FeedbackCategory;
  message: string;
  rating?: number; // 1..5, optional
  source: FeedbackSource;
  platform: FeedbackPlatform;
  /** Guest route only; unverified. */
  email?: string;
  /** Optional display name (guest route, or an override on the authed route). */
  name?: string;
}

/**
 * The submit result.
 *
 * ⚠ `ok` carries the reference code the shopper sees and both emails quote. A thank-you email that
 * fails to send does NOT turn this into `error` — the submission is already stored (FR-015); only a
 * failure to STORE is `error`.
 */
export type SubmitFeedbackResult =
  | { status: "ok"; referenceCode: string }
  | { status: "invalid"; field?: "message" | "email" | "category" | "rating" | "source" | "platform" }
  | { status: "rate_limited" }
  | { status: "error" };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Console (edge-admin → back-office).
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface FeedbackSubmitter {
  kind: "customer" | "guest";
  name: string | null;
  email: string | null;
  emailVerified: boolean;
}

/** A row in the console list. `preview` is a truncated message; the full text is on the detail. */
export interface FeedbackListItemDTO {
  referenceCode: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  rating: number | null;
  submitter: FeedbackSubmitter;
  preview: string;
  source: FeedbackSource;
  platform: FeedbackPlatform;
  hasEmail: boolean;
  createdAt: string; // ISO
}

export interface FeedbackListDTO {
  items: FeedbackListItemDTO[];
  total: number;
  nextCursor: string | null;
}

export interface FeedbackReplyDTO {
  body: string;
  staffName: string | null;
  sentAt: string; // ISO
}

export interface FeedbackNoteDTO {
  body: string;
  staffName: string | null;
  createdAt: string; // ISO
}

export interface FeedbackDetailDTO {
  referenceCode: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  rating: number | null;
  message: string;
  submitter: FeedbackSubmitter;
  source: FeedbackSource;
  platform: FeedbackPlatform;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** false when there is no submitter email to reply to (FR-028). */
  canReply: boolean;
  replies: FeedbackReplyDTO[];
  notes: FeedbackNoteDTO[];
}

/** Console list filters (all optional, combinable — FR-020). */
export interface FeedbackListQuery {
  q?: string;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  rating?: number;
  from?: string; // ISO date
  to?: string; // ISO date
  cursor?: string;
  limit?: number;
}
