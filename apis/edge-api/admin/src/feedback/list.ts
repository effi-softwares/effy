import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared"
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackStatus } from "@effy/shared-types"

/** Customer feedback as a console list (103): newest first, numbered pages with an exact total. */
export const FEEDBACK_LIST = {
  mode: "offset",
  sorts: {
    received: { sql: "created_at", dir: "desc" },
    // Unrated submissions go last whichever way it sorts.
    rating: { sql: "rating", dir: "desc", nullsLast: true },
  },
  defaultSort: "received",
  idSql: "id",
} as const satisfies ListOrder<"received" | "rating">

/** `open` (the default) is what still needs a person: new and in review. `all` hides nothing, spam included. */
export const FEEDBACK_VIEWS = ["open", "new", "in_review", "replied", "resolved", "archived", "spam", "all"] as const
export type FeedbackView = (typeof FEEDBACK_VIEWS)[number]

export interface FeedbackListFilters {
  view: FeedbackView
  category: FeedbackCategory
  rating: "1" | "2" | "3" | "4" | "5"
  receivedFrom: string
  receivedTo: string
}

export const FEEDBACK_LIST_SPEC: ListSpec<keyof typeof FEEDBACK_LIST.sorts, FeedbackListFilters> = {
  ...FEEDBACK_LIST,
  filters: {
    view: listFilter.oneOf(FEEDBACK_VIEWS),
    category: listFilter.oneOf(FEEDBACK_CATEGORIES),
    rating: listFilter.oneOf(["1", "2", "3", "4", "5"] as const),
    receivedFrom: listFilter.day,
    receivedTo: listFilter.day,
  },
}

export type FeedbackListRequest = ListRequest<keyof typeof FEEDBACK_LIST.sorts, FeedbackListFilters>

export const VIEW_STATUSES: Record<FeedbackView, readonly FeedbackStatus[] | null> = {
  open: ["new", "in_review"],
  new: ["new"],
  in_review: ["in_review"],
  replied: ["replied"],
  resolved: ["resolved"],
  archived: ["archived"],
  spam: ["spam"],
  all: null,
}
