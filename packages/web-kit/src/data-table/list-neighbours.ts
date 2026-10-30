import { useQuery, useQueryClient, type QueryFunction, type QueryKey } from "@tanstack/react-query";

import type { ListPage } from "@effy/shared-types";

export interface ListNeighbours {
  /** 1-based place in the list; null when it cannot be known (a keyset page past the first). */
  position: number | null;
  /** How many the list holds; null with no list. */
  total: number | null;
  /** The total is a floor ("10,000+"). */
  totalCapped: boolean;
  prev?: string;
  next?: string;
}

/**
 * Where a record sits in the list it was opened from, so its page can step to the one before or after it. The list
 * is the one the person last saw - the page of that list (under `key`, as `listQueryOptions` caches it) most recently
 * read that holds this record - so the steps follow its search, filters and sort. Opened from anywhere else, it
 * falls back to `fallback` (the list as it opens by default). Steps stay inside the page that was loaded.
 */
export function useListNeighbours<T>({
  key,
  id,
  rowId,
  fallback,
}: {
  key: QueryKey;
  id: string;
  rowId: (row: T) => string;
  /** The list as it opens by default — its `listQueryOptions`. */
  fallback?: { queryKey: QueryKey; queryFn?: unknown };
}): ListNeighbours {
  const qc = useQueryClient();
  const holds = (page: ListPage<T> | undefined) => !!page && page.items.some((r) => rowId(r) === id);
  const seen = qc
    .getQueryCache()
    .findAll({ queryKey: [...key, "list"] })
    .filter((q) => holds(q.state.data as ListPage<T> | undefined))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0];
  const opened = useQuery({
    queryKey: fallback?.queryKey ?? [...key, "list", "none"],
    queryFn: (fallback?.queryFn ?? (() => null)) as QueryFunction<ListPage<T> | null>,
    enabled: !seen && !!fallback,
  });

  const page = seen ? (seen.state.data as ListPage<T>) : opened.data && holds(opened.data) ? opened.data : undefined;
  if (!page) return { position: null, total: null, totalCapped: false };
  const qs = new URLSearchParams(seen ? String(seen.queryKey[key.length + 1] ?? "") : "");
  const at = page.items.findIndex((r) => rowId(r) === id);
  const offset = page.page !== null ? (page.page - 1) * page.pageSize : qs.has("cursor") ? null : 0;
  return {
    position: offset === null ? null : offset + at + 1,
    total: page.total,
    totalCapped: page.totalCapped,
    prev: at > 0 ? rowId(page.items[at - 1]!) : undefined,
    next: at < page.items.length - 1 ? rowId(page.items[at + 1]!) : undefined,
  };
}
