/**
 * Customer feedback, shared by the storefront form, the customer app, the customer and admin services
 * and back-office, so the length bounds cannot disagree with the DB check.
 */

// Fixed vocabularies, each mirrored by a DB check.

export type FeedbackCategory = "bug" | "suggestion" | "complaint" | "compliment" | "other";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "bug",
  "suggestion",
  "complaint",
  "compliment",
  "other",
];

/** Human labels: the one place a category becomes prose. */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Something's broken",
  suggestion: "A suggestion",
  complaint: "A complaint",
  compliment: "A compliment",
  other: "Something else",
};

/** Triage state: `new` on insert; `replied` is set by the system when a reply email succeeds; the rest by staff. `spam` hides a row without deleting it. */
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

/** The statuses staff may set directly (`replied` is system-set). */
export const FEEDBACK_SETTABLE_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "in_review",
  "resolved",
  "archived",
  "spam",
];

/** Where the submission originated. */
export type FeedbackSource = "checkout" | "general" | "other";

/** Which surface it came from. */
export type FeedbackPlatform = "web" | "ios" | "android";

// Length bounds, shared by the DB check, the validators and both clients. Change them with the migration.

export const FEEDBACK_MESSAGE_MAX = 5000;
export const FEEDBACK_REPLY_MAX = 5000;
export const FEEDBACK_NOTE_MAX = 2000;

/** The submit result. `ok` carries the reference both emails quote; only a failure to store is `error`, not a failed thank-you email. */
export type SubmitFeedbackResult =
  | { status: "ok"; referenceCode: string }
  | { status: "invalid"; field?: "message" | "email" | "category" | "rating" | "source" | "platform" }
  | { status: "rate_limited" }
  | { status: "error" };

// Console (admin service → back-office).

export interface FeedbackSubmitter {
  kind: "customer" | "guest";
  name: string | null;
  email: string | null;
  emailVerified: boolean;
}

/** A row in the console list. `preview` is truncated; the full text is on the detail. */
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
  createdAt: string;
}

/** A console list page (103). */
export type FeedbackListDTO = import("./list").ListPage<FeedbackListItemDTO>;

export interface FeedbackReplyDTO {
  body: string;
  staffName: string | null;
  sentAt: string;
}

export interface FeedbackNoteDTO {
  body: string;
  staffName: string | null;
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
  /** false when there is no submitter email to reply to. */
  canReply: boolean;
  replies: FeedbackReplyDTO[];
  notes: FeedbackNoteDTO[];
}

