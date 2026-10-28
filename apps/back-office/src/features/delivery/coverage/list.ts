import { defineListSearch, searchFilter, type ClientFilterParser } from "@effy/web-kit/data-table"

/**
 * The postcode list's view in the address (103), mirroring the admin service's `COVERAGE_LIST_SPEC`. The
 * delivery page has tabs, so its params are prefixed (`pc.q`, `pc.page`).
 */
export const coverageList = defineListSearch({
  id: "coverage-postcodes",
  mode: "offset",
  sorts: ["postcode", "distance"] as const,
  defaultSort: "postcode",
  sortDir: { postcode: "asc", distance: "asc" },
  filters: {
    group: ((raw) => (raw === "none" ? "none" : searchFilter.uuid(raw))) as ClientFilterParser<string>,
    source: searchFilter.oneOf(["computed", "manual"] as const),
    review: searchFilter.flag,
    today: searchFilter.oneOf(["offered", "not_offered"] as const),
    minKm: searchFilter.oneOf(["10", "25", "50"] as const),
  },
  prefix: "pc",
})
