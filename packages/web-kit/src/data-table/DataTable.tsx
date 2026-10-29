import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useHotkey } from "@tanstack/react-hotkeys";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTable, type Cell, type Header, type RowData } from "@tanstack/react-table";
import { SearchX, type LucideIcon } from "lucide-react";

import { cn } from "@effy/design-system";
import type { ListPage } from "@effy/shared-types";
import {
  Button,
  Checkbox,
  Skeleton,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
} from "@effy/design-system/ui";

import { ErrorState } from "../console/ErrorState";
import { EmptyState } from "../patterns/States";
import { ColumnMenu } from "./ColumnMenu";
import { effyFeatures, phoneAttrs, priorityClass, type EffyColumnDef, type EffyFeatures } from "./column-meta";
import { useHiddenColumns } from "./hidden-columns";
import type { FilterValue, ListSearch } from "./list-search";
import { isFiltered } from "./list-search";
import { usePrefetchNextPage, type ListQueryInput } from "./list-query";
import { useEdgePaging } from "./edge-paging";
import { pageMoves, Pagination } from "./Pagination";
import type { ListState } from "./use-list-state";

/** Where a row leads: a route the console's router knows. Passed to `<Link>` and `navigate` unchanged. */
export interface RowHref {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

export interface DataTableProps<T extends RowData, S extends string, F extends Record<string, FilterValue>> {
  /** Namespaces the hidden-columns memory: one console's list never reads another's. */
  app: "back-office" | "shop-web";
  list: ListSearch<S, F>;
  state: ListState<S, F>;
  columns: EffyColumnDef<T>[];
  query: UseQueryResult<ListPage<T>>;
  /** What `query` was built from, so the next page can be read ahead. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryInput?: ListQueryInput<T, S, F, any>;
  /** The toolbar's controls (views, facets, search); the column menu is added at its end. */
  toolbar?: ReactNode;
  /** Where a row leads: the identifying cell becomes a link to it, the whole row opens it, and Enter too. */
  rowHref?: (row: T) => RowHref;
  rowClassName?: (row: T) => string | undefined;
  /** Bulk selection by row id (FR-019): kept across pages, cleared by the screen when filters change. */
  selection?: { selected: ReadonlySet<string>; onChange: (next: ReadonlySet<string>) => void; label: (row: T) => string };
  /** Shown when nothing exists yet (no search, no filters). */
  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };
  /** Filters ignored in deciding "no matches" (a view select is a slice, not a narrowing). */
  viewFilters?: readonly (keyof F)[];
  /** A line above the frame (a bulk-action bar, a notice). */
  above?: ReactNode;
  /** Accessible name of the table. */
  label: string;
  /** The row's stable id (selection, keys). Default: its `id` field. */
  rowId?: (row: T) => string;
}

const SKELETON_ROWS = 10;

/**
 * A console list (103): the whole data set searched, filtered, sorted and paged by the server, in a frame
 * that fills the window — sticky column names, rows scrolling inside, the pager on the frame's bottom edge.
 * contracts/data-table-ui.md is its behaviour; each line there is a test.
 */
const idField = (row: unknown) => (row as { id: string }).id;

export function DataTable<T extends RowData, S extends string, F extends Record<string, FilterValue>>(
  props: DataTableProps<T, S, F>,
) {
  const { app, list, state, columns, query, queryInput, rowHref, rowClassName, selection, empty, label } = props;
  const rowId = props.rowId ?? idField;
  const navigate = useNavigate();
  const view = state.view;
  const page = query.data;
  const rows = useMemo(() => page?.items ?? [], [page]);

  const known = useMemo(() => columns.map((c) => c.id ?? "").filter(Boolean), [columns]);
  const locked = useMemo(() => columns.filter((c) => c.meta?.identifying).map((c) => c.id ?? ""), [columns]);
  const { hidden, toggle } = useHiddenColumns(app, list.spec.id, known, locked);
  const columnVisibility = useMemo(() => Object.fromEntries(hidden.map((id) => [id, false])), [hidden]);

  const table = useTable({
    features: effyFeatures,
    columns,
    data: rows,
    getRowId: rowId,
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    rowCount: page?.page != null ? page.total : undefined,
    pageCount: page?.page != null ? undefined : -1,
    state: {
      columnVisibility,
      pagination: { pageIndex: view.page - 1, pageSize: view.size },
    },
  });

  usePrefetchNextPage(
    queryInput ?? ({ key: [], list, view, fetch: async () => ({}) as never } as ListQueryInput<T, S, F>),
    page,
    Boolean(queryInput) && query.isSuccess && !query.isPlaceholderData,
  );

  // J/K move through the rows, Enter opens the focused one (from anywhere but a field).
  const [focus, setFocus] = useState(-1);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => setFocus(-1), [page]);
  useHotkey("J", () => setFocus((i) => Math.min(i + 1, rows.length - 1)), { ignoreInputs: true });
  useHotkey("K", () => setFocus((i) => Math.max(i - 1, 0)), { ignoreInputs: true });
  useHotkey(
    "Enter",
    () => {
      const r = rows[focus];
      if (r && rowHref) void navigate(rowHref(r) as never);
    },
    { ignoreInputs: true, enabled: focus >= 0 && Boolean(rowHref) },
  );
  useEffect(() => {
    if (focus < 0) return;
    bodyRef.current?.querySelector<HTMLElement>(`[data-row-index="${focus}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [focus]);

  // Scrolling past the end of a page turns to the next, past the top to the previous (the pager's own rule).
  const frameRef = useRef<HTMLDivElement>(null);
  const moves = pageMoves(page, page?.page ?? view.page);
  const pull = useEdgePaging({
    frame: frameRef,
    scroller: bodyRef,
    canNext: moves.canNext,
    canBack: moves.canBack,
    onNext: () => state.next(page?.nextCursor),
    onBack: state.back,
    busy: query.isFetching,
    pageKey: page,
  });

  const filtered = isFiltered(view, props.viewFilters ?? []);
  const visibleColumns = table.getVisibleLeafColumns();
  const allOnPage = selection ? rows.length > 0 && rows.every((r) => selection.selected.has(rowId(r))) : false;
  const someOnPage = selection ? rows.some((r) => selection.selected.has(rowId(r))) : false;
  const colSpan = visibleColumns.length + (selection ? 1 : 0);

  const headerCell = (header: Header<EffyFeatures, T, unknown>) => {
    const meta = header.column.columnDef.meta;
    const numeric = meta?.align === "numeric";
    const cls = cn(priorityClass(meta?.priority), meta?.className);
    const content = header.isPlaceholder ? null : <table.FlexRender header={header} />;
    if (meta?.sortKey) {
      const active = view.sort === meta.sortKey;
      return (
        <TableSortHead
          key={header.id}
          numeric={numeric}
          className={cls}
          direction={active ? view.dir : null}
          onSort={() => state.toggleSort(meta.sortKey as S)}
        >
          {content}
        </TableSortHead>
      );
    }
    return (
      <TableHead key={header.id} numeric={numeric} className={cls}>
        {content}
      </TableHead>
    );
  };

  const bodyCell = (cell: Cell<EffyFeatures, T, unknown>, row: T) => {
    const meta = cell.column.columnDef.meta;
    const content = <table.FlexRender cell={cell} />;
    return (
      <TableCell
        key={cell.id}
        numeric={meta?.align === "numeric"}
        mono={meta?.align === "mono"}
        className={cn(priorityClass(meta?.priority), meta?.className)}
        {...phoneAttrs(meta)}
      >
        {meta?.identifying && rowHref ? (
          <RowLink href={rowHref(row)}>{content}</RowLink>
        ) : (
          content
        )}
      </TableCell>
    );
  };

  let body: ReactNode;
  if (query.isError && !page) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.isPending) {
    body = null;
  } else if (rows.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchX}
        title="No matches"
        description="Nothing matches this search and these filters."
        action={
          <Button variant="outline" onClick={state.reset}>
            Reset filters
          </Button>
        }
      />
    ) : (
      <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
    );
  }

  return (
    <div className="ef-dt">
      {props.toolbar !== undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          {props.toolbar}
          <ColumnMenu
            columns={columns
              .filter((c) => c.id && c.meta?.label)
              .map((c) => ({
                id: c.id!,
                label: c.meta!.label,
                visible: !hidden.includes(c.id!),
                locked: Boolean(c.meta?.identifying),
              }))}
            onToggle={toggle}
          />
        </div>
      ) : null}
      {page && page.ignored.length > 0 ? (
        <p className="text-sm text-muted-foreground">Some filters in this link no longer exist and were removed.</p>
      ) : null}
      {query.isError && page ? (
        <p className="text-sm text-muted-foreground">
          Could not refresh this list; it shows what was last read.{" "}
          <Button variant="link" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      {state.restarted ? (
        <p className="text-sm text-muted-foreground">This list has changed since that page; it starts again from the newest.</p>
      ) : null}
      {props.above}
      <div ref={frameRef} className="ef-dt-frame" aria-busy={query.isFetching}>
        {query.isFetching && !query.isPending ? <div className="ef-dt-progress" aria-hidden="true" /> : null}
        <div ref={bodyRef} className={cn("ef-dt-scroll", query.isPlaceholderData && "ef-dt-stale")}>
          <table aria-label={label} aria-busy={query.isPending || undefined} className="ef-rtable w-full caption-bottom text-sm tabular-nums">
            <TableHeader className="ef-dt-head">
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {selection ? (
                    <TableHead className="w-12 pr-0">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                        onCheckedChange={(v) => {
                          const next = new Set(selection.selected);
                          for (const r of rows) (v === true ? next.add(rowId(r)) : next.delete(rowId(r)));
                          selection.onChange(next);
                        }}
                      />
                    </TableHead>
                  ) : null}
                  {group.headers.map(headerCell)}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isPending
                ? Array.from({ length: Math.min(view.size, SKELETON_ROWS) }, (_, i) => (
                    <TableRow key={`s${i}`} className="hover:bg-transparent">
                      {Array.from({ length: colSpan }, (_, j) => (
                        <TableCell key={j} {...(j === 0 ? { "data-m": "primary" } : { "data-m": "meta" })}>
                          <Skeleton className={cn("h-4", j === 0 ? "w-40" : "w-20")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : table.getRowModel().rows.map((row, i) => {
                    const r = row.original;
                    const sel = selection?.selected.has(rowId(r)) ?? false;
                    return (
                      <TableRow
                        key={row.id}
                        data-row-index={i}
                        data-state={sel ? "selected" : undefined}
                        data-focused={i === focus ? "" : undefined}
                        onClick={rowHref ? () => void navigate(rowHref(r) as never) : undefined}
                        className={cn(rowHref && "cursor-pointer", rowClassName?.(r))}
                      >
                        {selection ? (
                          <TableCell className="w-12 pr-0" data-m="check" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label={`Select ${selection.label(r)}`}
                              checked={sel}
                              onCheckedChange={(v) => {
                                const next = new Set(selection.selected);
                                if (v === true) next.add(rowId(r));
                                else next.delete(rowId(r));
                                selection.onChange(next);
                              }}
                            />
                          </TableCell>
                        ) : null}
                        {row.getVisibleCells().map((cell) => bodyCell(cell, r))}
                      </TableRow>
                    );
                  })}
            </TableBody>
          </table>
          {body ? <div className="ef-dt-state">{body}</div> : null}
        </div>
        {pull ? (
          <p className="ef-dt-pull" role="status">
            {pull === "next" ? "Keep scrolling for the next page" : "Keep scrolling for the previous page"}
          </p>
        ) : null}
        <Pagination
          page={page}
          pageNumber={page?.page ?? view.page}
          size={view.size}
          onSize={state.setSize}
          onFirst={() => state.goTo(1)}
          onBack={state.back}
          onNext={() => state.next(page?.nextCursor)}
          onLast={state.goTo}
        />
      </div>
    </div>
  );
}

/**
 * The identifying cell's link: a real anchor, so a modifier-click opens a new tab (FR-016). Typed loosely on
 * purpose — the console's router knows its routes; this module does not.
 */
function RowLink({ href, children }: { href: RowHref; children: ReactNode }) {
  const L = Link as unknown as (p: RowHref & { onClick: (e: { stopPropagation(): void }) => void; className: string; children: ReactNode }) => ReactNode;
  return (
    <L {...href} onClick={(e) => e.stopPropagation()} className="ef-dt-link">
      {children}
    </L>
  );
}

/** Narrowing helper for column definitions: keeps `T` while letting each column pick its value type. */
export function columnsFor<T extends RowData>(cols: EffyColumnDef<T>[]): EffyColumnDef<T>[] {
  return cols;
}
