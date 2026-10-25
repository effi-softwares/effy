export type { FeedbackCategory, FeedbackDetailDTO, FeedbackListDTO, FeedbackStatus } from "@effy/shared-types"

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
