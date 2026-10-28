export type { FeedbackCategory, FeedbackDetailDTO, FeedbackListDTO, FeedbackStatus } from "@effy/shared-types"

export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SETTABLE_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_NOTE_MAX,
} from "@effy/shared-types"

import { FEEDBACK_CATEGORIES } from "@effy/shared-types"
import type { FeedbackStatus } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** A quick read outside the list (the rail's and the overview's "new" count). */
export interface FeedbackListParams {
  status?: FeedbackStatus
}

export const FEEDBACK_VIEWS = ["open", "new", "in_review", "replied", "resolved", "archived", "spam", "all"] as const
export type FeedbackView = (typeof FEEDBACK_VIEWS)[number]

/** The feedback list's view in the address (103), mirroring the admin service's `FEEDBACK_LIST_SPEC`. */
export const feedbackList = defineListSearch({
  id: "feedback",
  mode: "offset",
  sorts: ["received", "rating"] as const,
  defaultSort: "received",
  sortDir: { received: "desc", rating: "desc" },
  filters: {
    view: searchFilter.oneOf(FEEDBACK_VIEWS),
    category: searchFilter.oneOf(FEEDBACK_CATEGORIES),
    rating: searchFilter.oneOf(["1", "2", "3", "4", "5"] as const),
    receivedFrom: searchFilter.day,
    receivedTo: searchFilter.day,
  },
})
