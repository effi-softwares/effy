import { MESSAGE_KIND_VALUES, MESSAGE_STATUSES } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** The Messages list's view in the address (103), mirroring the admin service's `MESSAGE_LIST_SPEC`. */
export const messagesList = defineListSearch({
  id: "messages",
  mode: "offset",
  sorts: ["created", "sent", "title"] as const,
  defaultSort: "created",
  sortDir: { created: "desc", sent: "desc", title: "asc" },
  filters: {
    kind: searchFilter.oneOf(MESSAGE_KIND_VALUES),
    audience: searchFilter.oneOf(["customer", "driver", "shop"] as const),
    status: searchFilter.oneOf(MESSAGE_STATUSES),
  },
})
