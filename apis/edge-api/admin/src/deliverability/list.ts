import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared"

/** Email deliverability as a console list (103): latest event first, numbered pages with an exact total. */
export const DELIVERABILITY_LIST = {
  mode: "offset",
  sorts: {
    lastEvent: { sql: "last_event_at", dir: "desc" },
    address: { sql: "address", dir: "asc" },
  },
  defaultSort: "lastEvent",
  // The address is the row's key (lower-cased once, at write).
  idSql: "address",
  idType: "text",
} as const satisfies ListOrder<"lastEvent" | "address">

/** `problems` (the default) is everything not reachable. */
export const DELIVERABILITY_VIEWS = ["problems", "reachable", "soft_failing", "undeliverable", "complained", "all"] as const
export type DeliverabilityView = (typeof DELIVERABILITY_VIEWS)[number]

export const DELIVERABILITY_LIST_SPEC: ListSpec<keyof typeof DELIVERABILITY_LIST.sorts, { view: DeliverabilityView }> = {
  ...DELIVERABILITY_LIST,
  filters: { view: listFilter.oneOf(DELIVERABILITY_VIEWS) },
}

export type DeliverabilityListRequest = ListRequest<keyof typeof DELIVERABILITY_LIST.sorts, { view: DeliverabilityView }>

export const VIEW_SQL: Record<DeliverabilityView, string> = {
  problems: "state <> 'reachable'",
  reachable: "state = 'reachable'",
  soft_failing: "state = 'soft_failing'",
  undeliverable: "state = 'undeliverable'",
  complained: "state = 'complained'",
  all: "TRUE",
}
