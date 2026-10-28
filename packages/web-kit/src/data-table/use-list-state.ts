import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavigate, useRouterState } from "@tanstack/react-router";

import type { ListPageSize } from "@effy/shared-types";

import type { FilterValue, ListSearch, ListView } from "./list-search";

/** How long typing pauses before the search reaches the address (and the server). */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Keyset back-stacks live in the history entry, not the address: a cursor in a shared link would point into
 * a ledger that has moved on since. Back from a record restores the entry, and with it the stack.
 */
interface ListHistoryState {
  effyList?: Record<string, string[]>;
}

export interface ListState<S extends string, F extends Record<string, FilterValue>> {
  view: ListView<S, F>;
  /** The search box's text, ahead of `view.q` while typing. */
  draftQ: string;
  setQ: (q: string) => void;
  setFilter: <K extends keyof F>(key: K, value: F[K] | undefined) => void;
  /** Several filters in one step (a date range, a facet that clears another). */
  setFilters: (patch: Partial<{ [K in keyof F]: F[K] | undefined }>) => void;
  /** A header click: the active column flips direction; another column starts at its own first direction. */
  toggleSort: (sort: S) => void;
  setSize: (size: ListPageSize) => void;
  /** Clears search and filters, keeps sort and size. */
  reset: () => void;
  /** Offset lists: go to a page. */
  goTo: (page: number) => void;
  /** Keyset lists: the next page starts at `cursor` (the current page's `nextCursor`). */
  next: (cursor?: string | null) => void;
  back: () => void;
  /** Keyset lists: the cursor the current page starts at (null on page 1). */
  cursor: string | null;
  /** A keyset list reopened past page 1 without its stack (a reload, a link) was restarted at page 1. */
  restarted: boolean;
}

export function useListState<S extends string, F extends Record<string, FilterValue>>(
  list: ListSearch<S, F>,
  search: Record<string, unknown>,
): ListState<S, F> {
  const navigate = useNavigate();
  const view = useMemo(() => list.read(search), [list, search]);
  const { id, mode } = list.spec;

  // The stack and the page it belongs to are read from ONE router snapshot: reading the page from the route's
  // search and the stack from history separately can pair a new stack with an old page mid-navigation.
  const snapshot = useRouterState({
    select: (s) =>
      JSON.stringify([list.read(s.location.search as Record<string, unknown>).page, (s.location.state as ListHistoryState).effyList?.[id] ?? []]),
  });
  const [snapshotPage, stack] = useMemo(() => JSON.parse(snapshot) as [number, string[]], [snapshot]);

  const go = useCallback(
    (next: ListView<S, F>, opts: { replace?: boolean; stack?: string[] } = {}) => {
      void navigate({
        to: ".",
        search: ((prev: Record<string, unknown>) => list.write(prev, next)) as never,
        replace: opts.replace ?? false,
        resetScroll: false,
        state: ((prev: ListHistoryState) => ({
          ...prev,
          effyList: { ...prev.effyList, [id]: opts.stack ?? [] },
        })) as never,
      });
    },
    [navigate, list, id],
  );

  // A change to what is listed starts again at page 1 with an empty stack (FR-006).
  const restart = useCallback(
    (patch: Partial<ListView<S, F>>, replace = false) => go({ ...view, ...patch, page: 1 }, { replace, stack: [] }),
    [go, view],
  );

  // Search: the box updates at once; the address after a pause, replacing the entry (typing is not history).
  const [draftQ, setDraftQ] = useState(view.q);
  const lastWritten = useRef(view.q);
  useEffect(() => {
    if (view.q !== lastWritten.current) {
      lastWritten.current = view.q;
      setDraftQ(view.q);
    }
  }, [view.q]);
  useEffect(() => {
    if (draftQ === view.q) return;
    const t = setTimeout(() => {
      lastWritten.current = draftQ;
      restart({ q: draftQ }, true);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draftQ, view.q, restart]);

  // A keyset page past 1 with no stack cannot be re-read; start again at 1 and say so.
  const orphaned = mode === "keyset" && snapshotPage > 1 && stack.length < snapshotPage - 1;
  const [restarted, setRestarted] = useState(false);
  useEffect(() => {
    if (!orphaned) return;
    setRestarted(true);
    go({ ...view, page: 1 }, { replace: true, stack: [] });
  }, [orphaned, go, view]);

  return {
    view,
    draftQ,
    setQ: setDraftQ,
    setFilter: (key, value) => restart({ filters: { ...view.filters, [key]: value } }),
    setFilters: (patch) => restart({ filters: { ...view.filters, ...patch } }),
    toggleSort: (sort) =>
      restart({
        sort,
        dir: sort === view.sort ? (view.dir === "asc" ? "desc" : "asc") : list.spec.sortDir[sort],
      }),
    setSize: (size) => restart({ size }),
    reset: () => {
      setDraftQ("");
      lastWritten.current = "";
      restart({ q: "", filters: {} });
    },
    goTo: (page) => go({ ...view, page: Math.max(1, page) }),
    next: (cursor) => {
      if (mode === "offset") return go({ ...view, page: view.page + 1 });
      if (!cursor) return;
      go({ ...view, page: view.page + 1 }, { stack: [...stack.slice(0, view.page - 1), cursor] });
    },
    back: () => {
      if (view.page <= 1) return;
      go({ ...view, page: view.page - 1 }, { stack: stack.slice(0, view.page - 2) });
    },
    cursor: mode === "keyset" && snapshotPage > 1 ? (stack[snapshotPage - 2] ?? null) : null,
    restarted,
  };
}
