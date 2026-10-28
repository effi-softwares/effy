import { listFilter, type FilterParser, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

/** Effy's postcode list as a console list (103): numbered pages with an exact total. */
export const COVERAGE_LIST = {
  mode: "offset",
  sorts: {
    postcode: { sql: "zp.postcode", dir: "asc" },
    distance: { sql: "zp.distance_km", dir: "asc" },
  },
  defaultSort: "postcode",
  idSql: "zp.id",
} as const satisfies ListOrder<"postcode" | "distance">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CoverageListFilters {
  /** A group id, or `none` for the ungrouped. */
  group: string;
  source: "computed" | "manual";
  review: boolean;
  today: "offered" | "not_offered";
  /** At least this far from the hub, km (two decimals at most). */
  minKm: string;
}

export const COVERAGE_LIST_SPEC: ListSpec<keyof typeof COVERAGE_LIST.sorts, CoverageListFilters> = {
  ...COVERAGE_LIST,
  filters: {
    group: ((raw) => (raw === "none" ? "none" : UUID.test(raw) ? raw.toLowerCase() : undefined)) as FilterParser<string>,
    source: listFilter.oneOf(["computed", "manual"] as const),
    review: listFilter.bool,
    today: listFilter.oneOf(["offered", "not_offered"] as const),
    minKm: ((raw) => (/^\d{1,4}(\.\d{1,2})?$/.test(raw.trim()) ? raw.trim() : undefined)) as FilterParser<string>,
  },
};

export type CoverageListRequest = ListRequest<keyof typeof COVERAGE_LIST.sorts, CoverageListFilters>;
