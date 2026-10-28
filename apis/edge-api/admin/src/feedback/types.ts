import type {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackSource,
  FeedbackStatus,
} from "@effy/shared-types"

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

/** Snapshotted at write time; no cross-schema FK. */
export interface StaffActor {
  sub: string
  name: string | null
}
