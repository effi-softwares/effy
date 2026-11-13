// The People list (119 FR-027; 103): searched, filtered, sorted and paged on the server, its state in the address.
// Removed people are hidden unless the Removed status is chosen. The accounts with no record ride beside the page.
import {
  likePattern,
  limitOffsetClause,
  listFilter,
  offsetListPage,
  orderBy,
  parseListQuery,
  runOffsetPage,
  type ListOrder,
  type ListRequest,
  type ListSpec,
  type Queryable,
} from "@effy/edge-shared";
import { mapMember, MEMBER_COLUMNS, MEMBER_FROM, type MemberRow } from "@effy/edge-shared/team";
import {
  BACK_OFFICE_ROLES,
  TEAM_STATUS_FILTERS,
  type BackOfficeRole,
  type NotOnTeamDTO,
  type TeamListDTO,
  type TeamListFilters,
  type TeamStatusFilter,
} from "@effy/shared-types";

export const TEAM_LIST = {
  mode: "offset",
  sorts: {
    name: { sql: "lower(COALESCE(s.name, s.email::text))", dir: "asc" },
    role: { sql: "CASE sr.role_key WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'csa' THEN 3 ELSE 4 END", dir: "asc" },
    lastSeen: { sql: "s.last_seen_at", dir: "desc", nullsLast: true },
    added: { sql: "s.created_at", dir: "desc" },
  },
  defaultSort: "name",
  idSql: "s.id",
} as const satisfies ListOrder<"name" | "role" | "lastSeen" | "added">;

export const TEAM_LIST_SPEC: ListSpec<keyof typeof TEAM_LIST.sorts, TeamListFilters> = {
  ...TEAM_LIST,
  filters: {
    role: listFilter.oneOf(BACK_OFFICE_ROLES as readonly BackOfficeRole[]),
    status: listFilter.oneOf(TEAM_STATUS_FILTERS as readonly TeamStatusFilter[]),
  },
};

export type TeamListRequest = ListRequest<keyof typeof TEAM_LIST.sorts, TeamListFilters>;

/** The Status filter in SQL ($3). The default (none chosen) is everyone but the removed. */
const STATUS_SQL = `CASE
  WHEN $3::text IS NULL THEN s.status <> 'removed'
  WHEN $3 = 'never' THEN s.status = 'active' AND s.last_seen_at IS NULL
  WHEN $3 = 'attention' THEN s.sign_in_issue IS NOT NULL AND s.status <> 'removed'
  ELSE s.status = $3 END`;

export async function readTeamPage(db: Queryable, req: TeamListRequest) {
  return runOffsetPage(req, async (read) => {
    const args: unknown[] = [req.q ? likePattern(req.q) : null, req.filters.role ?? null, req.filters.status ?? null];
    const paging = limitOffsetClause(read, args);
    const res = await db.query<MemberRow & { full_count: string }>(
      `SELECT ${MEMBER_COLUMNS}, count(*) OVER() AS full_count
         FROM ${MEMBER_FROM}
        WHERE ($1::text IS NULL OR s.name ILIKE $1 OR s.email::text ILIKE $1)
          AND ($2::text IS NULL OR sr.role_key = $2)
          AND (${STATUS_SQL})
        ${orderBy(TEAM_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
}

export async function readNotOnTeam(db: Queryable): Promise<{ rows: NotOnTeamDTO[]; checkedAt: string | null }> {
  const orphans = await db.query<{ username: string; email: string | null; enabled: boolean; groups: string[]; created: Date | null }>(
    `SELECT cognito_username AS username, email::text AS email, enabled, groups, created_in_pool_at AS created
       FROM admin.sign_in_orphan ORDER BY email, cognito_username`,
  );
  const check = await db.query<{ checked_at: Date }>(`SELECT checked_at FROM admin.team_check`);
  return {
    rows: orphans.rows.map((o) => ({
      username: o.username,
      email: o.email,
      enabled: o.enabled,
      groups: o.groups,
      createdAt: o.created ? o.created.toISOString() : null,
    })),
    checkedAt: check.rows[0]?.checked_at.toISOString() ?? null,
  };
}

export async function listTeam(db: Queryable, q: Readonly<Record<string, string | undefined>> | null | undefined): Promise<TeamListDTO> {
  const req = parseListQuery(q, TEAM_LIST_SPEC);
  const page = await readTeamPage(db, req);
  const extra = await readNotOnTeam(db);
  return { ...offsetListPage(page.rows.map(mapMember), req, page), notOnTeam: extra.rows, checkedAt: extra.checkedAt };
}
