import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

/** The driver register as a console list (103): by name, numbered pages with an exact total. */
export const DRIVER_LIST = {
  mode: "offset",
  sorts: { name: { sql: "lower(d.name)", dir: "asc" } },
  defaultSort: "name",
  idSql: "d.id",
} as const satisfies ListOrder<"name">;

/** The register's views. `employed` (the default) hides people who have left; `everyone` shows them too. */
export const DRIVER_VIEWS = ["employed", "active", "suspended", "offboarded", "everyone"] as const;
export type DriverView = (typeof DRIVER_VIEWS)[number];

export interface DriverListFilters {
  view: DriverView;
  zoneId: string;
}

export const DRIVER_LIST_SPEC: ListSpec<keyof typeof DRIVER_LIST.sorts, DriverListFilters> = {
  ...DRIVER_LIST,
  filters: { view: listFilter.oneOf(DRIVER_VIEWS), zoneId: listFilter.uuid },
};

export type DriverListRequest = ListRequest<keyof typeof DRIVER_LIST.sorts, DriverListFilters>;
