import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** The Automatic list's view in the address (103), mirroring the admin service's `AUTOMATION_LIST_SPEC`. */
export const automaticList = defineListSearch({
  id: "automatic-messages",
  mode: "offset",
  sorts: ["created", "name", "next", "last"] as const,
  defaultSort: "created",
  sortDir: { created: "desc", name: "asc", next: "asc", last: "desc" },
  filters: {
    status: searchFilter.oneOf(["active", "paused", "finished"] as const),
    mode: searchFilter.oneOf(["trigger", "repeat"] as const),
  },
})
