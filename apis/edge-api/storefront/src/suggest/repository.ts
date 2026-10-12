// Search suggestions (084): what the catalogue itself can offer for a few typed characters. SQL only.
//
// ⚠ EVERYTHING HERE COMES FROM THE CATALOGUE — product names, brands and aisles. Nothing is read
// from, or written about, what any shopper searched for.
import { pooled, type Queryable } from "@effy/edge-shared";

import { CARD_SELECT, type CardRow } from "../lib/cards";

export interface PhraseRow {
  phrase: string;
}

export interface AisleRow {
  key: string;
  name: string;
}

export interface SuggestRepository {
  /** Products whose name contains the text; a name that STARTS with it first. */
  products(q: string, limit: number): Promise<CardRow[]>;
  /** The text completed from product names ("oat milk" → "oat milk barista") and brands. */
  completions(q: string, limit: number): Promise<PhraseRow[]>;
  /** The top-level aisles the matching products sit in, the fullest first. */
  aislesHolding(q: string, limit: number): Promise<AisleRow[]>;
  /** Aisles and categories whose own name starts with the text. */
  aislesNamed(q: string, limit: number): Promise<AisleRow[]>;
}

/** `q` as a LIKE operand: its own `%`, `_` and `\` matched literally. */
export function likeLiteral(q: string): string {
  return q.replace(/[\\%_]/g, "\\$&");
}

/**
 * The pattern that lifts a completion out of a product name: the typed text, the rest of the word
 * it ends in, and at most ONE more word — unless that word is a size ("1L", "500g"), which says
 * nothing about what to search for.
 */
export function completionPattern(q: string): string {
  const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?i)(${literal}\\S*(?:\\s+[^\\s\\d]\\S*)?)`;
}

export function createSuggestRepository(db: Queryable = pooled): SuggestRepository {
  const rows = async <R extends object>(sql: string, args: unknown[]) =>
    (await db.query<R & Record<string, unknown>>(sql, args)).rows as R[];

  return {
    products: (q, limit) =>
      rows<CardRow>(
        `${CARD_SELECT}
-- availability-exempt: public.product — a LISTING filter, the search's own. An out-of-stock product
-- stays findable; the projected available column marks it (054 FR-013).
WHERE p.status = 'active'
  AND p.name ILIKE '%' || $1 || '%'
ORDER BY (p.name ILIKE $1 || '%') DESC, p.name ASC, p.id ASC
LIMIT $2`,
        [likeLiteral(q), limit],
      ),

    completions: (q, limit) =>
      rows<PhraseRow>(
        `
SELECT phrase
FROM (
    SELECT lower(substring(p.name FROM $2)) AS phrase, count(*) AS n
    FROM public.product p
    -- availability-exempt: public.product — a LISTING filter, the search's own (054 FR-013).
    WHERE p.status = 'active' AND p.name ILIKE '%' || $1 || '%'
    GROUP BY 1
  UNION ALL
    SELECT lower(p.brand) AS phrase, count(*) AS n
    FROM public.product p
    -- availability-exempt: public.product — a LISTING filter, the search's own (054 FR-013).
    WHERE p.status = 'active' AND p.brand ILIKE $1 || '%'
    GROUP BY 1
) found
WHERE phrase IS NOT NULL AND phrase <> lower($3)
GROUP BY phrase
ORDER BY sum(n) DESC, phrase ASC
LIMIT $4`,
        [likeLiteral(q), completionPattern(q), q, limit],
      ),

    aislesHolding: (q, limit) =>
      rows<AisleRow>(
        `
WITH RECURSIVE matched AS (
    SELECT p.primary_category_id AS id, count(*) AS n
    FROM public.product p
    -- availability-exempt: public.product — a LISTING filter, the search's own (054 FR-013).
    WHERE p.status = 'active' AND p.name ILIKE '%' || $1 || '%'
    GROUP BY 1
), up AS (
    SELECT c.id, c.parent_id, c.key, c.name, c.status, m.n
    FROM public.category c JOIN matched m ON m.id = c.id
  UNION ALL
    SELECT parent.id, parent.parent_id, parent.key, parent.name, parent.status, up.n
    FROM public.category parent JOIN up ON parent.id = up.parent_id
)
SELECT key, name
FROM up
-- availability-exempt: public.category — the taxonomy's own lifecycle.
WHERE parent_id IS NULL AND status = 'active'
GROUP BY key, name
ORDER BY sum(n) DESC, name ASC
LIMIT $2`,
        [likeLiteral(q), limit],
      ),

    aislesNamed: (q, limit) =>
      rows<AisleRow>(
        `
SELECT c.key AS key, c.name AS name
FROM public.category c
-- availability-exempt: public.category — the taxonomy's own lifecycle.
WHERE c.status = 'active' AND c.name ILIKE $1 || '%'
ORDER BY (c.parent_id IS NULL) DESC, c.display_order ASC, c.name ASC
LIMIT $2`,
        [likeLiteral(q), limit],
      ),
  };
}
