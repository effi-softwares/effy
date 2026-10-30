// Console lists (103): the ONE place a list request is parsed and a list's paging SQL is built. Every
// back-office and shop-web list route goes through here, so search, sort, paging and counting behave the
// same on every list. Contract: specs/103-console-data-tables/contracts/list-contract.md.
//
// What the helper owns: validating the query string, the whitelisted ORDER BY (always ending in the row's
// id, so two rows never tie at a page edge), the offset or keyset clause, the capped count and the
// envelope. What it does not own: a list's SQL - its SELECT, its joins and its filters stay in its
// repository, as raw SQL (Principle VI).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import {
  DEFAULT_PAGE_SIZE,
  LIST_COUNT_CAP,
  LIST_MAX_OFFSET,
  LIST_MAX_SEARCH,
  LIST_PAGE_SIZES,
  LIST_TOO_DEEP_SENTENCE,
  type ListPage,
  type ListPageSize,
  type SortDir,
} from "@effy/shared-types";

import { OPERATING_TZ } from "./collection-deadline";
import { problem, ProblemType, type RequestScope } from "./http";
import { emitMetric, metricNamespace } from "./metrics";

/** How a list pages: numbered pages with an exact total, or a cursor for ledgers that grow at the top. */
export type ListMode = "offset" | "keyset";

/** The Postgres type a keyset cursor's sort value is compared as. */
export type SortValueType = "text" | "timestamptz" | "numeric" | "int" | "date";

export interface SortSpec {
  /**
   * The SQL expression, from this whitelist only - a client string never reaches SQL. ⚠ It must never be
   * NULL (wrap a nullable column in COALESCE): a keyset row comparison against NULL matches nothing.
   */
  sql: string;
  /** The direction a first click sorts in. */
  dir: SortDir;
  /** Keyset lists: how the cursor's value is cast back. */
  type?: SortValueType;
  /**
   * Offset lists only: rows without a value go last in both directions (a product never priced). A keyset list
   * may not use it - its sort expression must never be NULL.
   */
  nullsLast?: true;
}

/** Turns one raw query value into a filter value, or `undefined` when the value is not one it knows. */
export type FilterParser<T> = (raw: string) => T | undefined;

/** What a list's SQL needs: its sorts and its id. Repositories declare this; services add the filters. */
export interface ListOrder<S extends string> {
  mode: ListMode;
  sorts: Readonly<Record<S, SortSpec>>;
  defaultSort: S;
  /** The row's primary key expression, the tie-break after every sort (e.g. `d.id`). */
  idSql: string;
  /** The id's Postgres type, for the keyset comparison. Default `uuid`. */
  idType?: "uuid" | "text" | "bigint";
}

export interface ListSpec<S extends string, F> extends ListOrder<S> {
  filters: { readonly [K in keyof F]-?: FilterParser<F[K]> };
}

export interface ListRequest<S extends string, F> {
  mode: ListMode;
  /** Trimmed search text, or null. Use `likePattern` to search with it. */
  q: string | null;
  sort: S;
  dir: SortDir;
  pageSize: ListPageSize;
  /** Offset lists: the 1-based page asked for. */
  page: number;
  /** Keyset lists: where the page starts, or null for the first page. */
  cursor: { value: string; id: string } | null;
  filters: Partial<F>;
  /** Filter parameters dropped because their value is not one the list knows. */
  ignored: string[];
  /** `?views=only`: answer the view counts instead of a page. */
  viewsOnly: boolean;
}

/** A request the list cannot answer; `listProblem` turns it into the error envelope. */
export class ListQueryError extends Error {
  constructor(
    readonly code: "validation" | "too_deep",
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ListQueryError";
  }
}

const RESERVED = new Set(["q", "sort", "dir", "page", "cursor", "pageSize", "views"]);

/**
 * Parses a list request. Forgiving where a stale link would otherwise break (an unknown sort, a bad page size,
 * a malformed cursor, a filter value that no longer exists: each falls back and is never an error), strict
 * only where the ask itself is wrong (search text too long, a page too deep).
 */
export function parseListQuery<S extends string, F>(
  qs: Readonly<Record<string, string | undefined>> | null | undefined,
  spec: ListSpec<S, F>,
): ListRequest<S, F> {
  const raw = qs ?? {};

  const qText = (raw.q ?? "").trim();
  if (qText.length > LIST_MAX_SEARCH) {
    throw new ListQueryError("validation", `search is longer than ${LIST_MAX_SEARCH} characters`, "q");
  }

  const sort = raw.sort && Object.prototype.hasOwnProperty.call(spec.sorts, raw.sort) ? (raw.sort as S) : spec.defaultSort;
  const dir: SortDir = raw.dir === "asc" || raw.dir === "desc" ? raw.dir : spec.sorts[sort].dir;

  const size = Number(raw.pageSize);
  const pageSize = (LIST_PAGE_SIZES as readonly number[]).includes(size) ? (size as ListPageSize) : DEFAULT_PAGE_SIZE;

  const pageNum = Number(raw.page);
  const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;
  if (spec.mode === "offset" && (page - 1) * pageSize >= LIST_MAX_OFFSET) {
    emitMetric(metricNamespace(), "ListQueryDepthRefused");
    throw new ListQueryError("too_deep", LIST_TOO_DEEP_SENTENCE, "page");
  }

  const cursor = spec.mode === "keyset" && raw.cursor ? decodeCursor(raw.cursor) : null;

  const filters: Partial<F> = {};
  const ignored: string[] = [];
  for (const key of Object.keys(spec.filters) as (keyof F & string)[]) {
    const value = raw[key];
    if (value === undefined || value === "") continue;
    const parsed = spec.filters[key](value);
    if (parsed === undefined) ignored.push(key);
    else filters[key] = parsed;
  }
  if (ignored.length > 0) emitMetric(metricNamespace(), "ListQueryParamIgnored", ignored.length);

  return {
    mode: spec.mode,
    q: qText.length > 0 ? qText : null,
    sort,
    dir,
    pageSize,
    page,
    cursor,
    filters,
    ignored,
    viewsOnly: raw.views === "only",
  };
}

/** Whether a query-string key is one of the list parameters every list shares (not a filter). */
export const isListParam = (key: string): boolean => RESERVED.has(key);

// ---- filter parsers ---------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ready-made filter parsers; anything they do not recognise is `undefined` (and so ignored). */
export const listFilter = {
  oneOf:
    <T extends string>(values: readonly T[]): FilterParser<T> =>
      (raw) =>
        (values as readonly string[]).includes(raw) ? (raw as T) : undefined,
  uuid: ((raw) => (UUID.test(raw) ? raw.toLowerCase() : undefined)) as FilterParser<string>,
  /** A calendar day `YYYY-MM-DD` that exists. */
  day: ((raw) => {
    if (!DAY.test(raw)) return undefined;
    const d = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? undefined : raw;
  }) as FilterParser<string>,
  bool: ((raw) => (raw === "true" ? true : raw === "false" ? false : undefined)) as FilterParser<boolean>,
  /** Free text (e.g. a postcode prefix), trimmed and bounded. */
  text: ((raw) => {
    const t = raw.trim();
    return t.length > 0 && t.length <= LIST_MAX_SEARCH ? t : undefined;
  }) as FilterParser<string>,
};

// ---- SQL fragments ----------------------------------------------------------------------------------

/** `%text%` for ILIKE with the user's `%`, `_` and `\` taken literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** `text%` - a prefix match with the same escaping. */
export function prefixPattern(q: string): string {
  return `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const SQL_DIR: Record<SortDir, string> = { asc: "ASC", desc: "DESC" };

/** `ORDER BY <whitelisted expression> <dir>, <id> <dir>` - a total order, so no row ties at a page edge. */
export function orderBy<S extends string, F>(spec: ListOrder<S>, req: ListRequest<S, F>): string {
  const d = SQL_DIR[req.dir];
  const s = spec.sorts[req.sort];
  if (s.nullsLast && spec.mode === "keyset") throw new Error("a keyset list's sort must never be NULL");
  return `ORDER BY ${s.sql} ${d}${s.nullsLast ? " NULLS LAST" : ""}, ${spec.idSql} ${d}`;
}

/**
 * Keyset lists: the WHERE condition that starts the page after the cursor, pushing its two values onto
 * `args`; null on the first page. A row comparison, so `(sort, id)` together decides "after".
 */
export function keysetCondition<S extends string, F>(
  spec: ListOrder<S>,
  req: ListRequest<S, F>,
  args: unknown[],
): string | null {
  if (!req.cursor) return null;
  const s = spec.sorts[req.sort];
  args.push(req.cursor.value, req.cursor.id);
  const op = req.dir === "desc" ? "<" : ">";
  return `(${s.sql}, ${spec.idSql}) ${op} ($${args.length - 1}::${s.type ?? "text"}, $${args.length}::${spec.idType ?? "uuid"})`;
}

/** `LIMIT … [OFFSET …]` for the page, pushing its values onto `args`. Keyset reads one extra row to know if there is a next page. */
export function pageClause<S extends string, F>(req: ListRequest<S, F>, args: unknown[]): string {
  if (req.mode === "keyset") {
    args.push(req.pageSize + 1);
    return `LIMIT $${args.length}`;
  }
  args.push(req.pageSize, (req.page - 1) * req.pageSize);
  return `LIMIT $${args.length - 1} OFFSET $${args.length}`;
}

/**
 * Keyset lists: two extra select-list columns carrying the row's sort value and id AS TEXT, which is what the
 * next cursor is made from. ⚠ Never build a cursor from a JS `Date`: it keeps milliseconds, Postgres keeps
 * microseconds, and every row in the same millisecond after the cursor's would be skipped.
 */
export function keysetColumns<S extends string, F>(spec: ListOrder<S>, req: ListRequest<S, F>): string {
  return `(${spec.sorts[req.sort].sql})::text AS list_sort_key, (${spec.idSql})::text AS list_row_id`;
}

/**
 * A day-range filter on a timestamp column: `from` and `to` are calendar days (`YYYY-MM-DD`, both inclusive)
 * in the operating time zone - the day a person in the business means - pushing its values onto `args`.
 * Null when neither end is set. Written as a range on the bare column so its index serves it.
 */
export function dayRangeCondition(column: string, range: { from?: string; to?: string }, args: unknown[]): string | null {
  const parts: string[] = [];
  if (range.from) {
    args.push(range.from);
    parts.push(`${column} >= ($${args.length}::date)::timestamp AT TIME ZONE '${OPERATING_TZ}'`);
  }
  if (range.to) {
    args.push(range.to);
    parts.push(`${column} < ($${args.length}::date + 1)::timestamp AT TIME ZONE '${OPERATING_TZ}'`);
  }
  return parts.length > 0 ? parts.join(" AND ") : null;
}

/** `LIMIT … OFFSET …` for what `runOffsetPage` asks to read, pushing its values onto `args`. */
export function limitOffsetClause(read: { limit: number; offset: number }, args: unknown[]): string {
  args.push(read.limit, read.offset);
  return `LIMIT $${args.length - 1} OFFSET $${args.length}`;
}

/** Wraps a list's filtered SELECT (no ORDER BY, no LIMIT) so it counts at most `LIST_COUNT_CAP + 1` rows. */
export function cappedCountSql(innerSelect: string): string {
  return `SELECT count(*)::int AS n FROM (${innerSelect} LIMIT ${LIST_COUNT_CAP + 1}) capped`;
}

// ---- cursor -----------------------------------------------------------------------------------------

/** A keyset cursor: the last row's sort value and id (as Postgres wrote them as text), opaque to the client. */
export function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify([value, id]), "utf8").toString("base64url");
}

/** A malformed cursor is null - the list restarts at its first page rather than failing. */
export function decodeCursor(raw: string): { value: string; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [value, id] = parsed as unknown[];
    if (typeof value !== "string" || typeof id !== "string" || value.length > 200 || id.length > 100) return null;
    return { value, id };
  } catch {
    return null;
  }
}

// ---- running a page ---------------------------------------------------------------------------------

/**
 * Offset lists. `read(limit, offset)` runs the list's query with `count(*) OVER () AS full_count` and returns
 * its rows. Asked past the last page (rows were deleted since the link was made), the last real page is
 * returned instead, and `page` says which.
 */
export async function runOffsetPage<S extends string, F, R extends { full_count: string | number }>(
  req: ListRequest<S, F>,
  read: (args: { limit: number; offset: number }) => Promise<R[]>,
): Promise<{ rows: R[]; total: number; page: number }> {
  const offset = (req.page - 1) * req.pageSize;
  const rows = await read({ limit: req.pageSize, offset });
  if (rows.length > 0 || req.page === 1) {
    return { rows, total: rows[0] ? Number(rows[0].full_count) : 0, page: req.page };
  }
  // Past the end: learn the total from the first row, then read the last page.
  const probe = await read({ limit: 1, offset: 0 });
  const total = probe[0] ? Number(probe[0].full_count) : 0;
  if (total === 0) return { rows: [], total: 0, page: 1 };
  const last = Math.ceil(total / req.pageSize);
  return { rows: await read({ limit: req.pageSize, offset: (last - 1) * req.pageSize }), total, page: last };
}

/** The offset envelope. */
export function offsetListPage<T>(
  items: T[],
  req: { pageSize: number; ignored: string[] },
  result: { total: number; page: number },
): ListPage<T> {
  return {
    items,
    pageSize: req.pageSize,
    total: result.total,
    totalCapped: false,
    page: result.page,
    nextCursor: null,
    ignored: req.ignored,
  };
}

/**
 * Keyset lists. `rows` are what the page query returned (up to `pageSize + 1`, selected with `keysetColumns`);
 * `count` is the capped count from `cappedCountSql`.
 */
export function keysetListPage<T, R extends { list_sort_key: string; list_row_id: string }>(
  rows: R[],
  req: { pageSize: number; ignored: string[] },
  count: number,
  toItem: (row: R) => T,
): ListPage<T> {
  const page = rows.slice(0, req.pageSize);
  const last = page[page.length - 1];
  return {
    items: page.map(toItem),
    pageSize: req.pageSize,
    total: Math.min(count, LIST_COUNT_CAP),
    totalCapped: count > LIST_COUNT_CAP,
    page: null,
    nextCursor: rows.length > req.pageSize && last ? encodeCursor(last.list_sort_key, last.list_row_id) : null,
    ignored: req.ignored,
  };
}

// ---- errors -----------------------------------------------------------------------------------------

/** The error envelope for a `ListQueryError`; null for anything else (the handler maps it as before). */
export function listProblem(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 | null {
  if (!(err instanceof ListQueryError)) return null;
  return problem(
    400,
    ProblemType.ValidationFailed,
    err.code === "too_deep" ? "Too deep" : "Invalid list request",
    err.message,
    scope,
    err.field ? [{ field: err.field, message: err.message }] : undefined,
  );
}
