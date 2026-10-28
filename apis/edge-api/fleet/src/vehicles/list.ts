import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import type { VehicleOwnership } from "@effy/shared-types";

/** The vehicle register as a console list (103): by plate, numbered pages with an exact total. */
export const VEHICLE_LIST = {
  mode: "offset",
  sorts: {
    plate: { sql: "upper(v.registration_plate)", dir: "asc" },
    vehicle: { sql: "lower(v.make || ' ' || v.model)", dir: "asc" },
  },
  defaultSort: "plate",
  idSql: "v.id",
} as const satisfies ListOrder<"plate" | "vehicle">;

/** `fleet` (the default) is everything not retired. */
export const VEHICLE_VIEWS = ["fleet", "active", "off_road", "retired"] as const;
export type VehicleView = (typeof VEHICLE_VIEWS)[number];

export interface VehicleListFilters {
  view: VehicleView;
  refrigeration: "chilled" | "frozen";
  owner: VehicleOwnership;
  nonCompliant: boolean;
}

export const VEHICLE_LIST_SPEC: ListSpec<keyof typeof VEHICLE_LIST.sorts, VehicleListFilters> = {
  ...VEHICLE_LIST,
  filters: {
    view: listFilter.oneOf(VEHICLE_VIEWS),
    refrigeration: listFilter.oneOf(["chilled", "frozen"] as const),
    owner: listFilter.oneOf(["effy_owned", "driver_owned"] as const),
    nonCompliant: listFilter.bool,
  },
};

export type VehicleListRequest = ListRequest<keyof typeof VEHICLE_LIST.sorts, VehicleListFilters>;
