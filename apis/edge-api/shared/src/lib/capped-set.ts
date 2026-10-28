// 103 FR-024: a set staff make and the console shows whole (promotion groups, skins, courier services, fee
// plans, a shop's team, the attribute library) is capped, so "shown whole" stays true. Each service refuses
// the create in its own error envelope, with this code and this sentence.
import { CAPPED_SET_LIMIT, listFullSentence } from "@effy/shared-types";

import { query, type Queryable } from "./db";

export const LIMIT_REACHED = "limit_reached";
export const SET_FULL_SENTENCE = listFullSentence(CAPPED_SET_LIMIT);

/**
 * True when the set already holds `CAPPED_SET_LIMIT` rows. `fromWhere` is the set's `FROM … WHERE …` (from a
 * repository, never a client string); pass the transaction when the insert runs in one.
 */
export async function setIsFull(fromWhere: string, args: unknown[] = [], tx?: Queryable): Promise<boolean> {
  const sql = `SELECT count(*)::int AS n FROM (SELECT 1 ${fromWhere} LIMIT ${CAPPED_SET_LIMIT}) s`;
  const res = tx ? await tx.query<{ n: number }>(sql, args) : await query<{ n: number }>(sql, args);
  return (res.rows[0]?.n ?? 0) >= CAPPED_SET_LIMIT;
}
