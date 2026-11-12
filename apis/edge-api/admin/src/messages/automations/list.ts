import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import type { AutomationMode, AutomationStatus } from "@effy/shared-types";

/** The Automatic messages list (115; 103): newest first. Columns are `a`'s; `last_run_at` is the latest run's time. */
export const AUTOMATION_LIST = {
  mode: "offset",
  sorts: {
    created: { sql: "a.created_at", dir: "desc" },
    name: { sql: "lower(a.name)", dir: "asc" },
    next: { sql: "a.next_run_at", dir: "asc", nullsLast: true },
    last: { sql: "(SELECT max(r.ran_at) FROM public.message_automation_run r WHERE r.automation_id = a.id)", dir: "desc", nullsLast: true },
  },
  defaultSort: "created",
  idSql: "a.id",
} as const satisfies ListOrder<"created" | "name" | "next" | "last">;

export interface AutomationListFilters {
  status: AutomationStatus;
  mode: AutomationMode;
}

export const AUTOMATION_LIST_SPEC: ListSpec<keyof typeof AUTOMATION_LIST.sorts, AutomationListFilters> = {
  ...AUTOMATION_LIST,
  filters: {
    status: listFilter.oneOf(["active", "paused", "finished"] as const),
    mode: listFilter.oneOf(["trigger", "repeat"] as const),
  },
};
export type AutomationListRequest = ListRequest<keyof typeof AUTOMATION_LIST.sorts, AutomationListFilters>;
