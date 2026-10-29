import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { ArrowRight, Check, CircleAlert, Dot, Download, History, XIcon } from "lucide-react";

import { isDomainError } from "@effy/api-client";
import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from "@effy/design-system/ui";
import {
  ACTIVITY_EXPORT_TOO_MANY,
  ACTIVITY_LOGS,
  activityKindOptions,
  type ActivityEntryDTO,
  type ActivityExportDTO,
  type ActivityLogId,
  type ActivityPage,
  type ActivityTone,
} from "@effy/shared-types";

import type { EffyColumnDef } from "../data-table/column-meta";
import { DataTable } from "../data-table/DataTable";
import { DateRangeFacet } from "../data-table/DateRangeFacet";
import { emitListEvent } from "../data-table/list-events";
import { listQueryOptions } from "../data-table/list-query";
import { useListState } from "../data-table/use-list-state";
import { Facet, ResetFilters, SearchBox } from "../patterns/Toolbar";
import { activityLogSearch, useActivityLog } from "./search";

/** What the drawer needs to read a log: the app's API client (its `get`) and the log's route. */
export interface ActivityLogSource {
  api: { get<T>(path: string, opts?: { signal?: AbortSignal }): Promise<T> };
  /** The log's route, without a query string. */
  path: string;
}

export interface ActivityLogDrawerProps extends ActivityLogSource {
  app: "back-office" | "shop-web";
  log: ActivityLogId;
  title: string;
  /** One line under the title: what the log is of ("EFY-4415 — everything that has happened to this order."). */
  description?: string;
  /**
   * The key root the page's live kind invalidates (071), so a change refreshes the open drawer. The drawer's own
   * key is this plus `["activity", log, path]`.
   */
  queryKey: QueryKey;
  /** What the log's "On" filter offers (a product's sizes); absent, there is none. */
  subjects?: readonly { value: string; label: string }[];
  /** The export's file name, without the date and extension ("order-EFY-4415-activity"). */
  fileName: string;
}

/**
 * A record's activity log (104): one drawer, the same on every page of both consoles. From the right and half the
 * window wide (never narrower than a readable table; a bottom sheet on a phone), it pages through every entry the
 * log holds, newest or oldest first, searched, filtered by type, date and — where a log covers several things —
 * what it was on, and exports what it shows as CSV. Its state is in the address; Back closes it.
 */
export function ActivityLogDrawer(props: ActivityLogDrawerProps) {
  const { open, close } = useActivityLog();
  const isMobile = useIsMobile();
  // Once each time it opens, by whatever route (a click, a shared link, Forward).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) emitListEvent({ name: "activity_log_opened", log: props.log });
    wasOpen.current = open;
  }, [open, props.log]);
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && close()}
      direction={isMobile ? "bottom" : "right"}
      handleOnly={!isMobile}
    >
      <DrawerContent
        aria-label={props.title}
        className={
          isMobile
            ? "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
            : cn(
                "overflow-hidden",
                "data-[vaul-drawer-direction=right]:w-[max(50vw,min(42rem,calc(100vw-1rem)))]",
                "data-[vaul-drawer-direction=right]:sm:max-w-none",
              )
        }
      >
        {isMobile ? <DrawerHandle /> : null}
        <div className={cn("flex items-start gap-3", isMobile ? "px-4 pt-3 pb-2" : "px-5 pt-4 pb-3")}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DrawerTitle className="flex items-center gap-2">
              <History aria-hidden="true" className="size-4 text-muted-foreground" />
              {props.title}
            </DrawerTitle>
            <DrawerDescription className={props.description ? undefined : "sr-only"}>
              {props.description ?? props.title}
            </DrawerDescription>
          </div>
          {isMobile ? null : (
            <DrawerClose asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1 text-muted-foreground">
                <XIcon aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Button>
            </DrawerClose>
          )}
        </div>
        {/* Mounted only while open: a closed drawer reads nothing. */}
        {open ? <ActivityLogBody {...props} /> : null}
      </DrawerContent>
    </Drawer>
  );
}

function ActivityLogBody({ app, log, api, path, queryKey, subjects, fileName }: ActivityLogDrawerProps) {
  const isMobile = useIsMobile();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const state = useListState(activityLogSearch, search);
  const { view } = state;
  const input = {
    key: [...queryKey, "activity", log, path] as const,
    list: activityLogSearch,
    view,
    cursor: state.cursor,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => api.get<ActivityPage>(`${path}?${qs}`, { signal }),
  };
  const query = useQuery(listQueryOptions(input));

  const kinds = activityKindOptions(log);
  // A log about one thing at a time (a product with one size) has nothing to say in its "On" column.
  const subjectHeader = subjects && subjects.length <= 1 ? null : ACTIVITY_LOGS[log].subject;
  const columns = useMemo(() => activityColumns(subjectHeader), [subjectHeader]);
  const filtered = Boolean(
    view.q.trim() || view.filters.kind || view.filters.from || view.filters.to || view.filters.sub,
  );

  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    problem: boolean;
  } | null>(null);
  const exportCsv = async () => {
    setExporting(true);
    setNotice(null);
    try {
      const qs = activityLogSearch.toQuery({ ...view, page: 1 });
      qs.delete("pageSize");
      qs.set("export", "csv");
      const out = await api.get<ActivityExportDTO>(`${path}?${qs}`);
      downloadCsv(out.csv, fileName);
      emitListEvent({ name: "activity_log_exported", log, rows: out.rows });
      setNotice({
        text: `Exported ${out.rows.toLocaleString("en-AU")} ${out.rows === 1 ? "entry" : "entries"}.`,
        problem: false,
      });
    } catch (err) {
      const tooMany = isDomainError(err) && err.status === 400 && (err.fields ?? []).some((f) => f.field === "to");
      if (tooMany) emitListEvent({ name: "activity_log_export_refused", log });
      setNotice({
        text: tooMany ? ACTIVITY_EXPORT_TOO_MANY : "The export couldn't be made. Try again.",
        problem: true,
      });
    } finally {
      setExporting(false);
    }
  };

  const toolbar: ReactNode = (
    <>
      {kinds.length > 1 ? (
        <Facet
          label="Type"
          value={view.filters.kind ?? null}
          options={kinds}
          onChange={(v) => state.setFilter("kind", v ?? undefined)}
        />
      ) : null}
      <DateRangeFacet
        label="Dates"
        from={view.filters.from}
        to={view.filters.to}
        onChange={(r) => state.setFilters({ from: r.from, to: r.to })}
      />
      {subjects && subjectHeader ? (
        <Facet
          label={subjectHeader}
          value={view.filters.sub ?? null}
          options={subjects}
          onChange={(v) => state.setFilter("sub", v ?? undefined)}
        />
      ) : null}
      {filtered ? <ResetFilters onReset={state.reset} /> : null}
      <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || query.isPending}>
        <Download aria-hidden="true" />
        {exporting ? "Exporting…" : "Export CSV"}
      </Button>
      <SearchBox value={state.draftQ} onChange={state.setQ} placeholder="Search this log" label="Search this log" />
    </>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", isMobile ? "overflow-y-auto px-4 pb-4" : "px-5 pb-4")}>
      <div className="ef-listpage min-h-0 flex-1">
        <DataTable
          app={app}
          label="Activity"
          list={activityLogSearch}
          state={state}
          columns={columns}
          query={query}
          toolbar={toolbar}
          above={
            notice ? (
              <p role="status" className={cn("text-sm", notice.problem ? "text-destructive" : "text-muted-foreground")}>
                {notice.text}
              </p>
            ) : null
          }
          empty={{
            icon: History,
            title: "Nothing recorded yet",
            description: "Everything that happens here appears in this log.",
          }}
        />
      </div>
    </div>
  );
}

// ---- columns --------------------------------------------------------------------------------------------

const WHEN = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The Timeline's marks (`patterns/Timeline.tsx`), so a log reads the same in a table. */
const MARK: Record<ActivityTone, { cls: string; icon: ReactNode }> = {
  default: { cls: "border bg-background", icon: <Dot /> },
  primary: { cls: "bg-primary-muted text-primary", icon: <ArrowRight /> },
  done: { cls: "bg-success-soft text-success", icon: <Check /> },
  problem: { cls: "bg-foreground text-background", icon: <CircleAlert /> },
};

function activityColumns(subjectHeader: string | null): EffyColumnDef<ActivityEntryDTO>[] {
  const cols: EffyColumnDef<ActivityEntryDTO>[] = [
    {
      id: "what",
      header: "What",
      cell: ({ row }) => {
        const e = row.original;
        const mark = MARK[e.tone] ?? MARK.default;
        return (
          <span className="flex min-w-0 items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full [&_svg]:size-2.5", mark.cls)}
            >
              {mark.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-pretty">{e.title}</span>
              {e.detail ? (
                <span className="block text-muted-foreground text-pretty whitespace-pre-line">{e.detail}</span>
              ) : null}
            </span>
          </span>
        );
      },
      meta: {
        label: "What",
        identifying: true,
        phone: "primary",
        className: "whitespace-normal",
      },
    },
  ];
  if (subjectHeader) {
    cols.push({
      id: "on",
      header: subjectHeader,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.subject ?? "—"}</span>,
      meta: { label: subjectHeader, priority: 2 },
    });
  }
  cols.push(
    {
      id: "who",
      header: "Who",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.actor ?? "—"}</span>,
      meta: { label: "Who" },
    },
    {
      id: "when",
      header: "When",
      cell: ({ row }) => (
        <time dateTime={row.original.at} className="whitespace-nowrap text-muted-foreground tabular-nums">
          {WHEN.format(new Date(row.original.at))}
        </time>
      ),
      meta: { label: "When", sortKey: "at", phone: "trail", className: "w-44" },
    },
  );
  return cols;
}

// ---- export ---------------------------------------------------------------------------------------------

/** Saves the CSV the server wrote, with a byte-order mark so a spreadsheet reads its words as UTF-8. */
function downloadCsv(csv: string, stem: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stem.replace(/[^\w.-]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
