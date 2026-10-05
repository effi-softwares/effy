import type { Queryable } from "../lib/db";

/** One place row — name, state, postcode. All three identify a place; no two do (030 R2a). */
export interface Locality {
  name: string;
  state: string;
  postcode: string;
}

const ALL_DIGITS = /^[0-9]+$/;

/**
 * The address typeahead (030): an all-digits query matches on postcode prefix; anything else
 * matches a case-insensitive NAME prefix (index-supported by `lower(name) text_pattern_ops`).
 * Alphabetical and bounded — ⚠ NEVER ordered by serviceability: the list must not hint the
 * verdict. The caller guarantees the query is at least two characters.
 */
export async function searchLocalities(q: Queryable, query: string, limit: number): Promise<Locality[]> {
  const sql = ALL_DIGITS.test(query)
    ? `
			SELECT name, state, postcode FROM public.locality
			WHERE postcode LIKE $1 || '%'
			ORDER BY name, state, postcode
			LIMIT $2`
    : `
			SELECT name, state, postcode FROM public.locality
			WHERE lower(name) LIKE lower($1) || '%'
			ORDER BY name, state, postcode
			LIMIT $2`;
  return (await q.query<Locality>(sql, [query, limit])).rows;
}
