// Domain shapes for the feedback console slice (046). The API contracts double as the domain shapes
// (identity map in repo.ts), matching the deliverability/shops slices. Labels come from the shared
// package so the console, the storefront, and the emails can never disagree (Principle II).
export type {
  FeedbackCategory,
  FeedbackDetailDTO,
  FeedbackListDTO,
  FeedbackListItemDTO,
  FeedbackNoteDTO,
  FeedbackReplyDTO,
  FeedbackStatus,
  FeedbackSubmitter,
} from "@effy/shared-types"

export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SETTABLE_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_NOTE_MAX,
} from "@effy/shared-types"

import type { FeedbackCategory, FeedbackStatus } from "@effy/shared-types"

export interface FeedbackListParams {
  q?: string
  category?: FeedbackCategory
  status?: FeedbackStatus
  rating?: number
  from?: string
  to?: string
  cursor?: string
  limit?: number
}
