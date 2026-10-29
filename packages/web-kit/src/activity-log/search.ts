import { useCallback } from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { defineListSearch, searchFilter } from "../data-table/list-search";

/**
 * The activity drawer's view (104), in the address like every console list (103): `log=1` opens it, and its search,
 * Type, dates, order, page size and Size are `log.`-prefixed so they never meet the page's own lists. Mirrors the
 * server's `activitySpec`.
 */
export const activityLogSearch = defineListSearch({
  id: "activity",
  mode: "keyset",
  sorts: ["at"] as const,
  defaultSort: "at",
  sortDir: { at: "desc" },
  filters: {
    kind: searchFilter.text,
    from: searchFilter.day,
    to: searchFilter.day,
    sub: searchFilter.uuid,
  },
  prefix: "log",
});

/** The param that opens the drawer. */
export const ACTIVITY_OPEN_PARAM = "log";

const isOpen = (search: Record<string, unknown>) => {
  const v = search[ACTIVITY_OPEN_PARAM];
  return v === 1 || v === "1" || v === true;
};

/**
 * For a hosting route's `validateSearch`: keeps the drawer's params, drops the rest. Spread beside the route's own:
 * `validateSearch: (raw) => ({ ...withActivityLog(raw), ...myList.validateSearch(raw) })`.
 */
export function withActivityLog(raw: Record<string, unknown>): Record<string, unknown> {
  return isOpen(raw) ? { [ACTIVITY_OPEN_PARAM]: 1, ...activityLogSearch.validateSearch(raw) } : {};
}

/** Whether a search key is the drawer's (`log`, `log.q`, …). */
const isDrawerKey = (k: string) => k === ACTIVITY_OPEN_PARAM || k.startsWith(`${ACTIVITY_OPEN_PARAM}.`);

/**
 * Opens and closes the page's activity drawer through the address. Opening pushes an entry, so Back closes it;
 * closing replaces the entry and forgets the drawer's search and filters. A page has one log.
 */
export function useActivityLog(): {
  open: boolean;
  /** Opens the drawer, already narrowed when asked (a size's row opens the log at that size). */
  show: (narrow?: { kind?: string; sub?: string }) => void;
  close: () => void;
} {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const open = isOpen(search);

  const show = useCallback(
    (narrow?: { kind?: string; sub?: string }) => {
      void navigate({
        to: ".",
        search: ((prev: Record<string, unknown>) => ({
          ...Object.fromEntries(Object.entries(prev).filter(([k]) => !isDrawerKey(k))),
          [ACTIVITY_OPEN_PARAM]: 1,
          ...(narrow?.kind ? { [`${ACTIVITY_OPEN_PARAM}.kind`]: narrow.kind } : {}),
          ...(narrow?.sub ? { [`${ACTIVITY_OPEN_PARAM}.sub`]: narrow.sub } : {}),
        })) as never,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const close = useCallback(() => {
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => !isDrawerKey(k)))) as never,
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);

  return { open, show, close };
}
