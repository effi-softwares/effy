import {
  DEFAULT_PAGE_SIZE,
  LIST_MAX_SEARCH,
  LIST_PAGE_SIZES,
  type ListPageSize,
  type SortDir,
} from "@effy/shared-types";

/**
 * A list's view lives in the address (103 FR-005): search, filters, sort, page and page size are route search
 * params, so reload, Back and a shared link all restore it. One `ListSearchSpec` per list declares them; the
 * route's `validateSearch` and the screen's `useListState` both read it, and its `toQuery` is what the list
 * route on the server receives (contracts/list-contract.md).
 */

/** A filter value in the address. Lists filter by enum words, ids, days and yes/no. */
export type FilterValue = string | boolean;

/** Turns one raw search-param value into a filter value, or `undefined` when it is not one the list knows. */
export type ClientFilterParser<T extends FilterValue> = (raw: unknown) => T | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filter parsers, the client twins of the server's `listFilter`. */
export const searchFilter = {
  oneOf:
    <T extends string>(values: readonly T[]): ClientFilterParser<T> =>
      (raw) =>
        typeof raw === "string" && (values as readonly string[]).includes(raw) ? (raw as T) : undefined,
  uuid: ((raw) => (typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : undefined)) as ClientFilterParser<string>,
  day: ((raw) => (typeof raw === "string" && DAY.test(raw) ? raw : undefined)) as ClientFilterParser<string>,
  /** `true` only (a flag); absent means off. The router may hand back a boolean or the string. */
  flag: ((raw) => (raw === true || raw === "true" ? true : undefined)) as ClientFilterParser<boolean>,
  bool: ((raw) =>
    raw === true || raw === "true" ? true : raw === false || raw === "false" ? false : undefined) as ClientFilterParser<boolean>,
  text: ((raw) => {
    if (typeof raw !== "string" && typeof raw !== "number") return undefined;
    const t = String(raw).trim();
    return t.length > 0 && t.length <= LIST_MAX_SEARCH ? t : undefined;
  }) as ClientFilterParser<string>,
};

export interface ListSearchSpec<S extends string, F extends Record<string, FilterValue>> {
  /** Names the list (hidden columns, the keyset back-stack). Unique per console. */
  id: string;
  mode: "offset" | "keyset";
  sorts: readonly S[];
  defaultSort: S;
  /** Each sort's first-click direction, as on the server. */
  sortDir: Readonly<Record<S, SortDir>>;
  filters: { readonly [K in keyof F]-?: ClientFilterParser<F[K]> };
  /**
   * A list that shares its route with others (a tab, a panel on a record page) prefixes its params
   * (`cov.q`, `pts.page`) so two lists on one page never read each other's.
   */
  prefix?: string;
  /** Page size the list opens at. Default 25 (FR-025). */
  defaultSize?: ListPageSize;
}

/** The parsed view of one list. Defaults are filled in; `filters` holds only what is set. */
export interface ListView<S extends string, F extends Record<string, FilterValue>> {
  q: string;
  sort: S;
  dir: SortDir;
  page: number;
  size: ListPageSize;
  filters: Partial<F>;
}

/** What a list contributes to its route's search params (flat, possibly prefixed, defaults left out). */
export type ListSearchParams = Record<string, string | number | boolean | undefined>;

export interface ListSearch<S extends string, F extends Record<string, FilterValue>> {
  spec: ListSearchSpec<S, F>;
  /** For the route's `validateSearch`: keeps this list's valid params, drops the rest. Never throws. */
  validateSearch: (raw: Record<string, unknown>) => ListSearchParams;
  /** The list's view from the route's search params. */
  read: (search: Record<string, unknown>) => ListView<S, F>;
  /** The route's next search params with `view` written over this list's (defaults removed). */
  write: (prev: Record<string, unknown>, view: ListView<S, F>) => Record<string, unknown>;
  /** The default view (no search, no filters, first page). */
  initial: () => ListView<S, F>;
  /** The server's query string for a view (contracts/list-contract.md); `cursor` for keyset pages. */
  toQuery: (view: ListView<S, F>, cursor?: string | null) => URLSearchParams;
}

export function defineListSearch<S extends string, F extends Record<string, FilterValue>>(
  spec: ListSearchSpec<S, F>,
): ListSearch<S, F> {
  const p = spec.prefix ? `${spec.prefix}.` : "";
  const key = (k: string) => `${p}${k}`;
  const defaultSize = spec.defaultSize ?? DEFAULT_PAGE_SIZE;
  const filterKeys = Object.keys(spec.filters) as (keyof F & string)[];

  const initial = (): ListView<S, F> => ({
    q: "",
    sort: spec.defaultSort,
    dir: spec.sortDir[spec.defaultSort],
    page: 1,
    size: defaultSize,
    filters: {},
  });

  const read = (search: Record<string, unknown>): ListView<S, F> => {
    const v = initial();
    const q = search[key("q")];
    if (typeof q === "string" || typeof q === "number") v.q = String(q).slice(0, LIST_MAX_SEARCH);
    const sort = search[key("sort")];
    if (typeof sort === "string" && (spec.sorts as readonly string[]).includes(sort)) {
      v.sort = sort as S;
      v.dir = spec.sortDir[v.sort];
    }
    const dir = search[key("dir")];
    if (dir === "asc" || dir === "desc") v.dir = dir;
    const page = Number(search[key("page")]);
    if (Number.isInteger(page) && page >= 1) v.page = page;
    const size = Number(search[key("size")]);
    if ((LIST_PAGE_SIZES as readonly number[]).includes(size)) v.size = size as ListPageSize;
    for (const k of filterKeys) {
      const parsed = spec.filters[k](search[key(k)]);
      if (parsed !== undefined) v.filters[k] = parsed;
    }
    return v;
  };

  const own = (v: ListView<S, F>): ListSearchParams => {
    const out: ListSearchParams = {};
    if (v.q.trim()) out[key("q")] = v.q;
    if (v.sort !== spec.defaultSort) out[key("sort")] = v.sort;
    if (v.dir !== spec.sortDir[v.sort]) out[key("dir")] = v.dir;
    if (v.page > 1) out[key("page")] = v.page;
    if (v.size !== defaultSize) out[key("size")] = v.size;
    for (const k of filterKeys) {
      const f = v.filters[k];
      if (f !== undefined) out[key(k)] = f;
    }
    return out;
  };

  const ownKeys = new Set(["q", "sort", "dir", "page", "size", ...filterKeys].map(key));

  return {
    spec,
    initial,
    read,
    validateSearch: (raw) => own(read(raw)),
    write: (prev, view) => {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(prev)) if (!ownKeys.has(k)) next[k] = v;
      return { ...next, ...own(view) };
    },
    toQuery: (view, cursor) => {
      const qs = new URLSearchParams();
      const q = view.q.trim();
      if (q) qs.set("q", q);
      qs.set("sort", view.sort);
      qs.set("dir", view.dir);
      qs.set("pageSize", String(view.size));
      if (spec.mode === "offset") qs.set("page", String(view.page));
      else if (cursor) qs.set("cursor", cursor);
      for (const k of filterKeys) {
        const f = view.filters[k];
        if (f !== undefined) qs.set(k, String(f));
      }
      return qs;
    },
  };
}

/** Whether any filter or a search is set - the difference between "no matches" and "nothing yet". */
export function isFiltered<S extends string, F extends Record<string, FilterValue>>(
  view: ListView<S, F>,
  except: readonly (keyof F)[] = [],
): boolean {
  if (view.q.trim()) return true;
  return Object.entries(view.filters).some(([k, v]) => v !== undefined && !except.includes(k as keyof F));
}
