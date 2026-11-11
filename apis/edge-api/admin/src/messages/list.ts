import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import { MESSAGE_KIND_VALUES, MESSAGE_STATUSES, type MessageKind, type MessageStatus, type NotificationAudience } from "@effy/shared-types";

/** The Messages list (103): newest first, numbered pages with an exact total. Columns are `m`'s. */
export const MESSAGE_LIST = {
  mode: "offset",
  sorts: {
    created: { sql: "m.created_at", dir: "desc" },
    // A message not yet sent sorts after those that were.
    sent: { sql: "COALESCE(m.sent_at, m.send_at)", dir: "desc", nullsLast: true },
    title: { sql: "lower(m.title)", dir: "asc" },
  },
  defaultSort: "created",
  idSql: "m.id",
} as const satisfies ListOrder<"created" | "sent" | "title">;

export interface MessageListFilters {
  kind: MessageKind;
  audience: NotificationAudience;
  status: MessageStatus;
}

export const MESSAGE_LIST_SPEC: ListSpec<keyof typeof MESSAGE_LIST.sorts, MessageListFilters> = {
  ...MESSAGE_LIST,
  filters: {
    kind: listFilter.oneOf(MESSAGE_KIND_VALUES as readonly MessageKind[]),
    audience: listFilter.oneOf(["customer", "driver", "shop"] as const),
    status: listFilter.oneOf(MESSAGE_STATUSES as readonly MessageStatus[]),
  },
};
export type MessageListRequest = ListRequest<keyof typeof MESSAGE_LIST.sorts, MessageListFilters>;
