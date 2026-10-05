import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { TRIGRAM_EXPR } from "./filters";

/**
 * ⚠ THE SEARCH EXPRESSION MUST BE THE INDEX EXPRESSION, CHARACTER FOR CHARACTER.
 *
 * Postgres matches an expression index by the expression. If the text relevance search scores
 * against drifts from the text the GIN trigram index was built on — a reordered column, a dropped
 * coalesce, one extra space — the planner stops using the index and every relevance search becomes
 * a sequential scan. Nothing errors and nothing looks wrong until the catalogue is large.
 *
 * So this reads the migration that created the index and compares.
 */
function migrationsDir(): string {
  let cur = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    const candidate = resolve(cur, "db", "migrations");
    if (existsSync(candidate)) return candidate;
    cur = dirname(cur);
  }
  throw new Error("db/migrations not found");
}

it("TRIGRAM_EXPR is the product_search_trgm_idx expression with the query's alias", () => {
  const sql = readFileSync(resolve(migrationsDir(), "20260716092105_product_catalog.sql"), "utf8");
  const m = /CREATE INDEX product_search_trgm_idx ON public\.product\s+USING gin \(\((.+)\) gin_trgm_ops\);/.exec(sql);
  if (!m) throw new Error("product_search_trgm_idx not found in the catalogue migration — this guard would prove nothing");

  // The index is declared on bare column names; the query reads them through the alias `p`.
  const indexed = m[1]!.replace(/\b(name|sku|brand|short_description)\b/g, "p.$1");
  expect(TRIGRAM_EXPR).toBe(indexed);
});
