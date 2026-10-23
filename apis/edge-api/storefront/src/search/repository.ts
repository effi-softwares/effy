import { pooled, type Queryable } from "@effy/edge-shared";

import { CARD_COLUMNS, CARD_FROM, CARD_SELECT, type CardRow } from "../lib/cards";
import { binder, cursorPredicate, filters, matchedVariantSql, orderClause, TRIGRAM_EXPR, type SearchParams } from "./filters";

/** CardRow plus `score`: CARD_COLUMNS selected verbatim with one column appended. */
export interface SearchRow extends CardRow {
  score: number;
}

export interface SearchRepository {
  searchCards(p: SearchParams): Promise<SearchRow[]>;
  countCards(p: SearchParams): Promise<number>;
  cardsByIds(ids: readonly string[]): Promise<CardRow[]>;
}

export function createSearchRepository(db: Queryable = pooled): SearchRepository {
  return {
    async searchCards(p) {
      const args: unknown[] = [];
      const next = binder(args);

      let sql = `SELECT ${CARD_COLUMNS}`;
      // Present for every sort so one row type serves them all.
      sql +=
        p.sort === "relevance" && p.q !== ""
          ? `,\n       similarity(${TRIGRAM_EXPR}, ${next(p.q)}) AS score`
          : ",\n       0::real AS score";
      if (p.q !== "") sql += `,\n       ${matchedVariantSql(next(p.q.trim()))} AS matched_variant_id`;
      sql += CARD_FROM;
      sql += filters(p, next);
      if (p.cursor) sql += cursorPredicate({ ...p, cursor: p.cursor }, next);
      sql += orderClause(p.sort);
      sql += `\nLIMIT ${next(p.limit)}`;

      return (await db.query<SearchRow>(sql, args)).rows;
    },

    /** Shares `filters` with `searchCards`, so the total and the list describe the same set. */
    async countCards(p) {
      const args: unknown[] = [];
      // count(*) is a bigint, which the driver returns as a string.
      const sql = `SELECT count(*)::int AS n FROM public.product p${filters(p, binder(args))}`;
      return (await db.query<{ n: number }>(sql, args)).rows[0]?.n ?? 0;
    },

    /** The caller re-orders. */
    async cardsByIds(ids) {
      return (
        await db.query<CardRow>(
          `${CARD_SELECT}
-- availability-exempt: public.product — a LISTING filter, not a purchasability decision.
-- Out-of-stock products stay listed; the projected available column marks them.
WHERE p.status = 'active'
  AND p.id = ANY($1::uuid[])`,
          [[...ids]],
        )
      ).rows;
    },
  };
}
