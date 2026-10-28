import { useEffect } from "react";

import { keepPreviousData, queryOptions, useQueryClient, type QueryKey } from "@tanstack/react-query";

import type { ListPage, ListViews } from "@effy/shared-types";

import type { FilterValue, ListSearch, ListView } from "./list-search";

/**
 * Reads one page from the list's route. `qs` is the whole query string; pass `signal` to the fetch. A list may
 * answer more than the page (Products' tab counts): `P` keeps it.
 */
export type ListFetcher<T, P extends ListPage<T> = ListPage<T>> = (qs: URLSearchParams, signal: AbortSignal) => Promise<P>;

export interface ListQueryInput<T, S extends string, F extends Record<string, FilterValue>, P extends ListPage<T> = ListPage<T>> {
  /**
   * The list's key root. ⚠ It must start with the root its live kind invalidates (`["orders", …]`), so an
   * announcement refreshes the page on screen (071, FR-018).
   */
  key: QueryKey;
  list: ListSearch<S, F>;
  view: ListView<S, F>;
  /** Keyset lists: where this page starts. */
  cursor?: string | null;
  fetch: ListFetcher<T, P>;
}

/**
 * One list page as server state. Every server-owned value is in the key (the query string itself), the
 * previous page stays on screen while the next loads, and a superseded request is cancelled.
 */
export function listQueryOptions<T, S extends string, F extends Record<string, FilterValue>, P extends ListPage<T> = ListPage<T>>(
  input: ListQueryInput<T, S, F, P>,
) {
  const qs = input.list.toQuery(input.view, input.cursor);
  return queryOptions({
    queryKey: [...input.key, "list", qs.toString()] as const,
    queryFn: ({ signal }) => input.fetch(qs, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * A list's view counts for the search and every filter except the view itself (`except`), in one request
 * (`?views=only`, FR-017). Counts move slowly; they are kept 30 s and refreshed by live announcements.
 */
export function viewsQueryOptions<V extends string, S extends string, F extends Record<string, FilterValue>>(input: {
  key: QueryKey;
  list: ListSearch<S, F>;
  view: ListView<S, F>;
  except: readonly (keyof F & string)[];
  fetch: (qs: URLSearchParams, signal: AbortSignal) => Promise<ListViews<V>>;
}) {
  const filters = { ...input.view.filters };
  for (const k of input.except) delete filters[k];
  const qs = input.list.toQuery({ ...input.view, filters, page: 1 });
  for (const k of ["sort", "dir", "page", "pageSize"]) qs.delete(k);
  qs.set("views", "only");
  return queryOptions({
    queryKey: [...input.key, "views", qs.toString()] as const,
    queryFn: ({ signal }) => input.fetch(qs, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Offset lists: once a page has settled, read the next one in the background so Next is instant. */
export function usePrefetchNextPage<T, S extends string, F extends Record<string, FilterValue>, P extends ListPage<T> = ListPage<T>>(
  input: ListQueryInput<T, S, F, P>,
  page: ListPage<T> | undefined,
  settled: boolean,
): void {
  const client = useQueryClient();
  const hasNext = page?.page != null && page.page * page.pageSize < page.total;
  const nextOptions = hasNext ? listQueryOptions({ ...input, view: { ...input.view, page: input.view.page + 1 } }) : null;
  const nextKey = nextOptions ? JSON.stringify(nextOptions.queryKey) : null;
  useEffect(() => {
    if (!settled || !nextOptions || input.list.spec.mode !== "offset") return;
    void client.prefetchQuery(nextOptions);
    // Keyed on the next page's key only: re-running on every render would not re-fetch, but is noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, nextKey]);
}
