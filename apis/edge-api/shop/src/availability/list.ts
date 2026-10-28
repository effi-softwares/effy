import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import { AVAILABILITY_FILTERS, type AvailabilityFilter } from "@effy/shared-types";

/**
 * Availability as a console list (103). A shop sells hundreds of sizes, not millions, and a size's stock
 * state is worked out in code (`stockState`), so the filter, counts, sort and page run over the search's
 * result rather than in SQL. The sort expressions name what is compared; `service.ts` compares them.
 */
export const AVAILABILITY_LIST = {
  mode: "offset",
  sorts: {
    name: { sql: "product name, then size", dir: "asc" },
    stock: { sql: "stock on hand (uncounted last)", dir: "asc" },
  },
  defaultSort: "name",
  idSql: "variant_id",
} as const satisfies ListOrder<"name" | "stock">;

export const AVAILABILITY_LIST_SPEC: ListSpec<keyof typeof AVAILABILITY_LIST.sorts, { filter: AvailabilityFilter }> = {
  ...AVAILABILITY_LIST,
  filters: { filter: listFilter.oneOf(AVAILABILITY_FILTERS) },
};

export type AvailabilityListRequest = ListRequest<keyof typeof AVAILABILITY_LIST.sorts, { filter: AvailabilityFilter }>;
