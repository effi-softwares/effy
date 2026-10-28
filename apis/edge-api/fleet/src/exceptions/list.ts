import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

/** Failed deliveries as a console list (103): open first, newest first, numbered pages with an exact total. */
export const EXCEPTION_LIST = {
  mode: "offset",
  sorts: { when: { sql: "f.failed_at", dir: "desc" } },
  defaultSort: "when",
  idSql: "f.id",
} as const satisfies ListOrder<"when">;

export const EXCEPTION_VIEWS = ["open", "resolved", "all"] as const;
export type ExceptionView = (typeof EXCEPTION_VIEWS)[number];

export const EXCEPTION_LIST_SPEC: ListSpec<"when", { view: ExceptionView }> = {
  ...EXCEPTION_LIST,
  filters: { view: listFilter.oneOf(EXCEPTION_VIEWS) },
};

export type ExceptionListRequest = ListRequest<"when", { view: ExceptionView }>;
