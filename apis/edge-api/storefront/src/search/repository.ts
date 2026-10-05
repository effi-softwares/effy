// Repository layer: SQL only. Reads the catalogue for the CUSTOMER projection — money cast to text
// so it crosses the wire exactly. Wire rows are mapped to the DTO in the service.
import { pooled, type Queryable } from "@effy/edge-shared";

import { CARD_COLUMNS, CARD_FROM, CARD_SELECT, type CardRow } from "../lib/cards";
import { binder, cursorPredicate, filters, orderClause, TRIGRAM_EXPR, type SearchParams } from "./filters";

/**
 * CardRow plus the relevance score.
 *
 * ⚠ CardRow is EXTENDED, never restated. `searchCards` selects CARD_COLUMNS verbatim and appends
 * one score column, so its result set IS CardRow's plus `score` by construction. An earlier version
 * restated the fields, missed one, and every search then failed at runtime.
 */
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
    /** The dynamic keyset query, in the requested order. */
    async searchCards(p) {
      const args: unknown[] = [];
      const next = binder(args);

      let sql = `SELECT ${CARD_COLUMNS}`;
      // The score column exists for every sort so one row type serves them all; it is only
      // meaningful under relevance, where the ORDER BY reads it.
      sql +=
        p.sort === "relevance" && p.q !== ""
          ? `,\n       similarity(${TRIGRAM_EXPR}, ${next(p.q)}) AS score`
          : ",\n       0::real AS score";
      sql += CARD_FROM;
      sql += filters(p, next);
      if (p.cursor) sql += cursorPredicate({ ...p, cursor: p.cursor }, next);
      sql += orderClause(p.sort);
      sql += `\nLIMIT ${next(p.limit)}`;

      return (await db.query<SearchRow>(sql, args)).rows;
    },

    /**
     * How many products match the filters, ignoring ordering and pagination (025 FR-016a). Shares
     * `filters` with `searchCards`, which is what keeps the headline number and the list beneath
     * it describing the same result set.
     */
    async countCards(p) {
      const args: unknown[] = [];
      // ::int — count(*) is a bigint, which this driver hands back as a STRING.
      const sql = `SELECT count(*)::int AS n FROM public.product p${filters(p, binder(args))}`;
      return (await db.query<{ n: number }>(sql, args)).rows[0]?.n ?? 0;
    },

    /** Hydrate a set of ids (recently viewed). Order is not guaranteed — the caller re-orders. */
    async cardsByIds(ids) {
      return (
        await db.query<CardRow>(
          `${CARD_SELECT}
-- availability-exempt: public.product — a LISTING filter, not a purchasability decision.
-- Out-of-stock products stay listed; the projected available column marks them (FR-013, A10).
WHERE p.status = 'active'
  AND p.id = ANY($1::uuid[])`,
          [[...ids]],
        )
      ).rows;
    },
  };
}
