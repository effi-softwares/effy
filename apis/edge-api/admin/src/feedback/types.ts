import type {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSource,
  FeedbackStatus,
} from "@effy/shared-types"

/**
 * Internal shapes for the feedback console slice (046 US2/US3). Wire DTOs come from `@effy/shared-types`
 * (Principle II); these are the row shapes and param bags that never leave the data/service layer.
 */

export class FeedbackError extends Error {
  constructor(
    public readonly kind: "validation" | "not_found" | "conflict" | "send_failed" | "unavailable",
    message: string,
  ) {
    super(message)
    this.name = "FeedbackError"
  }
}

export interface SubmissionRow {
  reference_code: string
  category: FeedbackCategory
  status: FeedbackStatus
  rating: number | null
  message: string
  submitter_name: string | null
  submitter_email: string | null
  email_verified: boolean
  customer_id: string | null
  source: FeedbackSource
  platform: FeedbackPlatform
  created_at: Date
  updated_at: Date
}

export interface ReplyRow {
  body: string
  staff_name: string | null
  sent_at: Date
}

export interface NoteRow {
  body: string
  staff_name: string | null
  created_at: Date
}

export interface ListParams {
  q: string | null
  category: FeedbackCategory | null
  status: FeedbackStatus | null
  rating: number | null
  from: string | null
  to: string | null
  limit: number
  offset: number
}

/** The staff identity captured on a reply or note (snapshot at write time; no cross-schema FK). */
export interface StaffActor {
  sub: string
  name: string | null
}
