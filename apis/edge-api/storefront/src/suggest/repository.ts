// Everything comes from the catalogue; nothing is read or written about what shoppers searched.
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
  /** A name that starts with the text comes first. */
  products(q: string, limit: number): Promise<CardRow[]>;
  /** "oat milk" → "oat milk barista", from product names and brands. */
  completions(q: string, limit: number): Promise<PhraseRow[]>;
  /** The fullest first. */
  aislesHolding(q: string, limit: number): Promise<AisleRow[]>;
  aislesNamed(q: string, limit: number): Promise<AisleRow[]>;
}

/** `%`, `_` and `\` matched literally. */
export function likeLiteral(q: string): string {
  return q.replace(/[\\%_]/g, "\\$&");
}

/** The typed text, the rest of its word, and at most one more word unless that is a size ("1L"). */
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
-- stays findable; the projected available column marks it.
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
    -- availability-exempt: public.product — a LISTING filter, the search's own.
    WHERE p.status = 'active' AND p.name ILIKE '%' || $1 || '%'
    GROUP BY 1
  UNION ALL
    SELECT lower(p.brand) AS phrase, count(*) AS n
    FROM public.product p
    -- availability-exempt: public.product — a LISTING filter, the search's own.
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
    -- availability-exempt: public.product — a LISTING filter, the search's own.
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
