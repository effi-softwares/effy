import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import type { ProductImportState } from "@effy/shared-types";

/** Product imports as a console list (103): newest first, numbered pages with an exact total. */
export const IMPORT_LIST = {
  mode: "offset",
  sorts: {
    created: { sql: "i.created_at", dir: "desc" },
    file: { sql: "lower(i.file_name)", dir: "asc" },
  },
  defaultSort: "created",
  idSql: "i.id",
} as const satisfies ListOrder<"created" | "file">;

const STATES = ["checking", "checked", "creating", "done", "failed"] as const satisfies readonly ProductImportState[];

export interface ImportListFilters {
  shopId: string;
  state: ProductImportState;
}

export const IMPORT_LIST_SPEC: ListSpec<keyof typeof IMPORT_LIST.sorts, ImportListFilters> = {
  ...IMPORT_LIST,
  filters: { shopId: listFilter.uuid, state: listFilter.oneOf(STATES) },
};

export type ImportListRequest = ListRequest<keyof typeof IMPORT_LIST.sorts, ImportListFilters>;
