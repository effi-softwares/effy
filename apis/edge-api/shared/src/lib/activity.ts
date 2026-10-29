// Activity logs (104): the ONE place a log is paged, searched, filtered and exported. Every log route in
// back-office and shop-web answers through `activityResponse`, so every log behaves the same in its drawer.
// Spec: specs/104-activity-log-drawer/plan.md.
//
// A log is an ACTIVITY SOURCE: a raw-SQL SELECT scoped to one record (an order, a shop, a driver …) that yields
// `id, at, kind, action, actor, search_text, facts`, and a function that turns one row into words. The helper
// wraps the source — it never re-writes it — and adds the search, the Type filter, the date range, the keyset
// page and the capped count, or (for `?export=csv`) every matching row as CSV.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import {
  ACTIVITY_CSV_HEADER,
  ACTIVITY_EXPORT_CAP,
  ACTIVITY_EXPORT_TOO_MANY,
  ACTIVITY_LOGS,
  type ActivityEntryDTO,
  type ActivityExportDTO,
  type ActivityLogId,
  type ActivityPage,
  type ActivityTone,
} from "@effy/shared-types";

import { OPERATING_TZ } from "./collection-deadline";
import { query } from "./db";
import { json, type RequestScope } from "./http";
import {
  cappedCountSql,
  dayRangeCondition,
  keysetColumns,
  keysetCondition,
  keysetListPage,
  likePattern,
  listFilter,
  listProblem,
  ListQueryError,
  orderBy,
  pageClause,
  parseListQuery,
  type ListOrder,
  type ListRequest,
  type ListSpec,
} from "./list-query";
import { emitMetric, metricNamespace } from "./metrics";

/** One row of a source, as its SELECT names the columns. */
export interface ActivityRow {
  /** Text, unique within the log: a source over several tables prefixes each table's ids (`fe:`, `ph:`). */
  id: string;
  at: Date;
  /** One of the log's kinds (`ACTIVITY_LOGS[log].kinds`). */
  kind: string;
  /** The source's own name for what happened; `actionWords` says it in words for search. */
  action: string;
  /** Who, in words; null when nobody is named. The source resolves names — never a `sub`. */
  actor: string | null;
  /** The raw facts an entry's words are made from (names, numbers, notes, reasons), searched with ILIKE. */
  search_text: string | null;
  facts: Record<string, unknown> | null;
}

/** What `entry` says about one row. `actor` overrides the row's when the words decide it. */
export interface ActivityWords {
  title: string;
  detail?: string | null;
  subject?: string | null;
  tone?: ActivityTone;
  actor?: string | null;
}

export interface ActivitySource {
  /**
   * A SELECT yielding exactly the `ActivityRow` columns, scoped to one record. Its placeholders are `$1…$n` of
   * `args`; the helper's own follow. ⚠ `id` must be text and unique, `at` never NULL (a keyset compares both).
   */
  sql: string;
  args: unknown[];
  /** Each action's leading words, so a search for words the server composes finds the entry. */
  actionWords: Readonly<Record<string, string>>;
  entry: (row: ActivityRow) => ActivityWords;
}

export interface ActivityFilters {
  kind: string;
  from: string;
  to: string;
  /** A log-specific subject id (a stock log's size); the source applies it. */
  sub: string;
}

export type ActivityRequest = ListRequest<"at", ActivityFilters> & {
  export: boolean;
};

/** Newest first, by cursor. `id` is text: sources union tables. */
export const ACTIVITY_ORDER = {
  mode: "keyset",
  sorts: { at: { sql: "e.at", dir: "desc", type: "timestamptz" } },
  defaultSort: "at",
  idSql: "e.id",
  idType: "text",
} as const satisfies ListOrder<"at">;

export function activitySpec(log: ActivityLogId): ListSpec<"at", ActivityFilters> {
  return {
    ...ACTIVITY_ORDER,
    filters: {
      kind: listFilter.oneOf(Object.keys(ACTIVITY_LOGS[log].kinds)),
      from: listFilter.day,
      to: listFilter.day,
      sub: listFilter.uuid,
    },
  };
}

/** A log request: 103's list parameters, the log's filters, and `export=csv`. */
export function parseActivityQuery(
  qs: Readonly<Record<string, string | undefined>> | null | undefined,
  log: ActivityLogId,
): ActivityRequest {
  const { export: format, ...rest } = qs ?? {};
  return {
    ...parseListQuery(rest, activitySpec(log)),
    export: format === "csv",
  };
}

/** The actions whose words contain `q` — how a search reaches words composed in TypeScript. */
export function actionsMatching(words: Readonly<Record<string, string>>, q: string): string[] {
  const needle = q.toLowerCase();
  return Object.entries(words)
    .filter(([, w]) => w.toLowerCase().includes(needle))
    .map(([a]) => a);
}

/** The kinds whose names contain `q` ("refund" finds the Refunds kind). */
function kindsMatching(log: ActivityLogId, q: string): string[] {
  const needle = q.toLowerCase();
  return Object.entries(ACTIVITY_LOGS[log].kinds as Record<string, string>)
    .filter(([, w]) => w.toLowerCase().includes(needle))
    .map(([k]) => k);
}

/** The WHERE clause over the wrapped source for the request's search, Type and dates; pushes onto `args`. */
function whereOf(log: ActivityLogId, source: ActivitySource, req: ActivityRequest, args: unknown[]): string {
  const parts: string[] = [];
  if (req.filters.kind) {
    args.push(req.filters.kind);
    parts.push(`e.kind = $${args.length}`);
  }
  const days = dayRangeCondition("e.at", { from: req.filters.from, to: req.filters.to }, args);
  if (days) parts.push(days);
  if (req.q) {
    args.push(likePattern(req.q));
    const p = `$${args.length}`;
    args.push(actionsMatching(source.actionWords, req.q));
    const a = `$${args.length}`;
    args.push(kindsMatching(log, req.q));
    const k = `$${args.length}`;
    parts.push(
      `(e.search_text ILIKE ${p} OR e.actor ILIKE ${p} OR e.action = ANY(${a}::text[]) OR e.kind = ANY(${k}::text[]))`,
    );
  }
  return parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
}

const COLUMNS = "e.id, e.at, e.kind, e.action, e.actor, e.search_text, e.facts";

export function toActivityEntry(source: ActivitySource, row: ActivityRow): ActivityEntryDTO {
  const w = source.entry(row);
  return {
    id: row.id,
    at: row.at.toISOString(),
    kind: row.kind,
    title: w.title,
    detail: w.detail ?? null,
    subject: w.subject ?? null,
    actor: w.actor !== undefined ? w.actor : row.actor,
    tone: w.tone ?? "default",
  };
}

/** One page of a log, newest (or oldest) first, with a count capped at 10,000. */
export async function readActivity(
  log: ActivityLogId,
  source: ActivitySource,
  req: ActivityRequest,
): Promise<ActivityPage> {
  const args = [...source.args];
  const where = whereOf(log, source, req, args);
  const countArgs = [...args];
  const after = keysetCondition(ACTIVITY_ORDER, req, args);
  const condition = after ? (where ? `${where} AND ${after}` : `WHERE ${after}`) : where;
  const paging = pageClause(req, args);
  const [rows, count] = await Promise.all([
    query<ActivityRow & { list_sort_key: string; list_row_id: string }>(
      `SELECT ${COLUMNS}, ${keysetColumns(ACTIVITY_ORDER, req)}
         FROM (${source.sql}) e
        ${condition}
        ${orderBy(ACTIVITY_ORDER, req)}
        ${paging}`,
      args,
    ),
    query<{ n: number }>(cappedCountSql(`SELECT 1 FROM (${source.sql}) e ${where}`), countArgs),
  ]);
  return keysetListPage(rows.rows, req, count.rows[0]?.n ?? 0, (r) => toActivityEntry(source, r));
}

/** Every entry matching the request, as CSV. More than the cap is refused (FR-004), never cut. */
export async function exportActivity(
  log: ActivityLogId,
  source: ActivitySource,
  req: ActivityRequest,
): Promise<ActivityExportDTO> {
  const args = [...source.args];
  const where = whereOf(log, source, req, args);
  args.push(ACTIVITY_EXPORT_CAP + 1);
  const res = await query<ActivityRow>(
    `SELECT ${COLUMNS} FROM (${source.sql}) e ${where} ${orderBy(ACTIVITY_ORDER, req)} LIMIT $${args.length}`,
    args,
  );
  if (res.rows.length > ACTIVITY_EXPORT_CAP) {
    emitMetric(metricNamespace(), "ActivityExportRefused");
    throw new ListQueryError("too_deep", ACTIVITY_EXPORT_TOO_MANY, "to");
  }
  const kinds = ACTIVITY_LOGS[log].kinds as Record<string, string>;
  const lines = [csvLine(ACTIVITY_CSV_HEADER)];
  for (const row of res.rows) {
    const e = toActivityEntry(source, row);
    lines.push(
      csvLine([csvWhen(row.at), kinds[e.kind] ?? e.kind, e.title, e.detail ?? "", e.subject ?? "", e.actor ?? ""]),
    );
  }
  emitMetric(metricNamespace(), "ActivityExported", res.rows.length);
  return { csv: `${lines.join("\r\n")}\r\n`, rows: res.rows.length };
}

/**
 * A log route's whole answer: parse, then a page or the export. A refusal of the request itself (search too
 * long, export too big) is a 400 here; anything else is rethrown for the service's own error mapping.
 * `source` may throw the service's not-found.
 */
export async function activityResponse(
  queryString: Readonly<Record<string, string | undefined>> | null | undefined,
  scope: RequestScope,
  log: ActivityLogId,
  source: (req: ActivityRequest) => Promise<ActivitySource>,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const req = parseActivityQuery(queryString, log);
    const src = await source(req);
    return json(200, req.export ? await exportActivity(log, src, req) : await readActivity(log, src, req), scope);
  } catch (err) {
    const refused = listProblem(err, scope);
    if (refused) return refused;
    throw err;
  }
}

// ---- words shared by the sources -----------------------------------------------------------------------

/**
 * A back-office person's name from a sign-in subject: the staff record's name (else its email), "Former staff"
 * when the record is gone, NULL when there is no subject. ⚠ Back-office logs only — a shop never names Effy staff.
 */
export function staffNameSql(sub: string): string {
  return `CASE WHEN ${sub} IS NULL THEN NULL ELSE COALESCE(
    (SELECT COALESCE(st.name, st.email) FROM admin.staff st WHERE st.cognito_sub = ${sub}),
    (SELECT ss.name FROM public.shop_staff ss WHERE ss.cognito_sub = ${sub}),
    (SELECT d.name FROM public.driver d WHERE d.cognito_sub = ${sub}),
    'Former staff') END`;
}

/** A string fact, or null. */
export function activityFact(row: ActivityRow, key: string): string | null {
  const v = row.facts?.[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

/** A number fact, or null. */
export function activityFactNumber(row: ActivityRow, key: string): number | null {
  const v = row.facts?.[key];
  return typeof v === "number"
    ? v
    : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))
      ? Number(v)
      : null;
}

/** "status changed" from `driver.status_changed`: the fallback words for an action nobody named yet. */
export function actionFallback(action: string): string {
  const words = action
    .replace(/^[a-z_]+\./, "")
    .replace(/[._]/g, " ")
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : action;
}

// ---- CSV ------------------------------------------------------------------------------------------------

const WHEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPERATING_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `2026-10-29 14:03`, in the business's time zone. */
export function csvWhen(at: Date): string {
  const p = Object.fromEntries(WHEN.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break; a cell a spreadsheet would run as a formula
 * (`=`, `+`, `-`, `@`, tab, CR) is prefixed with `'` — a log carries words people typed.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}
