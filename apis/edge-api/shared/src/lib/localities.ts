/**
 * Locality lookup for operator-facing consoles — the one definition of "a real Australian place".
 *
 * ⚠ PROMOTED HERE FROM `edge-api/admin` BY 032, and the reason is Principle II rather than tidiness.
 * 031 built this for the back office; 032 needs the same picker on the SHOP console, because a shop
 * declaring which areas it will serve same-day must choose from real places by name, exactly as an
 * admin composing a zone does. Two copies would mean two definitions of what counts as a real place,
 * free to drift — and one of them would be the one deciding what a shop just committed to.
 *
 * Same move 028 made with the S3 presign helper, proved the same way: the origin service's tests must
 * pass UNMODIFIED after the extraction.
 *
 * ⚠ WHY THE COLD PATH READS public.locality DIRECTLY, rather than calling core-api's storefront
 * endpoint: `core-api` has NO cloud deployment. It runs on a laptop; these Lambdas run in AWS. A
 * console calling it would work locally and break in dev, and an operator surface would depend on the
 * customer hot path being up. Same table, two services, two paths — the split `promo_code` already
 * has (031 research).
 */
import { query } from "./db";

/** One place, as an operator would name it. */
export interface LocalityRow {
  name: string;
  state: string;
  postcode: string;
}

/** Bounded so a console list stays scannable. Higher than the shopper's 8 — a console has room. */
export const LOCALITY_LIMIT = 20;

/** Below this there is nothing worth asking the database. */
export const MIN_LOCALITY_QUERY = 2;

export const POSTCODE_RE = /^[0-9]{4}$/;

/**
 * Name-prefix search.
 *
 * ⚠ `lower(name) LIKE $1 || '%'` is served by `locality_name_prefix_idx`, which is declared with
 * `text_pattern_ops`. Under a non-C collation a plain B-tree does NOT serve that predicate and
 * Postgres sequentially scans ~15,400 rows on every keystroke — correct, every test still green,
 * nothing reporting it (030 research R5). Do not "simplify" the index.
 */
export async function searchLocalitiesByName(q: string, limit = LOCALITY_LIMIT): Promise<LocalityRow[]> {
  const res = await query<LocalityRow>(
    `SELECT name, state, postcode
       FROM public.locality
      WHERE lower(name) LIKE lower($1) || '%'
      ORDER BY name, state, postcode
      LIMIT $2`,
    [q, limit],
  );
  return res.rows;
}

/**
 * Everything a postcode covers — ⚠ THE DATA BEHIND THE DISCLOSURE, on both consoles.
 *
 * 3350 returns 20 rows (Ballarat); 3550 returns 12 (Bendigo). Choosing "Alfredton" is choosing all
 * twenty, because serviceability is postcode-decided everywhere on this platform. Without this said
 * out loud before confirming, the operator believes they made a narrow decision and made a broad one,
 * and the only evidence otherwise is an order from somewhere they never meant to serve. No error, no
 * log line, no alert.
 *
 * ⚠ An EMPTY result is meaningful, not a failure: it means no locality names this postcode — the live
 * 3001 case, Melbourne's PO-box code, which has no street addresses. Callers warn; they do not refuse.
 */
export async function localitiesForPostcode(postcode: string): Promise<LocalityRow[]> {
  const res = await query<LocalityRow>(
    `SELECT name, state, postcode FROM public.locality WHERE postcode = $1 ORDER BY name`,
    [postcode],
  );
  return res.rows;
}

export interface PostcodeCoverageResult {
  postcode: string;
  places: LocalityRow[];
  /**
   * ⚠ Returned even though a caller could take `places.length`. The disclosure sentence is built from
   * it, and a client measuring a list it was handed says "1 other place" when there are twenty,
   * because the list was truncated somewhere upstream.
   */
  count: number;
}

export async function postcodeCoverage(postcode: string): Promise<PostcodeCoverageResult> {
  const places = await localitiesForPostcode(postcode);
  return { postcode, places, count: places.length };
}

/**
 * Classify a raw operator query: a 4-digit postcode, or a name prefix.
 *
 * ⚠ The SERVER classifies, so no caller has to decide what it is holding first — and both consoles
 * classify identically, which they would not if each did it in its own input handler.
 */
export function isPostcodeQuery(raw: string): boolean {
  return POSTCODE_RE.test(raw);
}
