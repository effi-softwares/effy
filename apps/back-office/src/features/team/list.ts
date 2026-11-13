import { BACK_OFFICE_ROLES, TEAM_STATUS_FILTERS } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** The People list's view in the address (103), mirroring the admin-team service's `TEAM_LIST_SPEC`. */
export const teamList = defineListSearch({
  id: "team",
  mode: "offset",
  sorts: ["name", "role", "lastSeen", "added"] as const,
  defaultSort: "name",
  sortDir: { name: "asc", role: "asc", lastSeen: "desc", added: "desc" },
  filters: {
    role: searchFilter.oneOf(BACK_OFFICE_ROLES),
    status: searchFilter.oneOf(TEAM_STATUS_FILTERS),
  },
})
