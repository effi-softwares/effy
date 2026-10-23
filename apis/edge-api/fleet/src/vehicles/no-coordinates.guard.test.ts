import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * No coordinates on shops or vehicles: sequencing is ordering, not geometry, and a column nothing reads
 * is a decision made in advance. Reads the migrations, where a column is born.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "..", "..", "..", "..", "..", "db", "migrations");

/** `public.locality` and `public.delivery_settings` legitimately hold points (hub, suburb centroids). */
const FORBIDDEN_TABLES = ["public.shop", "public.vehicle"];

function allMigrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(migrationsDir, f), "utf8"))
    .join("\n");
}

/** SQL comments stripped, so a column named in prose is not mistaken for one declared. */
function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("FR-031 — no coordinates on a shop or a vehicle", () => {
  const sql = withoutComments(allMigrationSql());

  for (const table of FORBIDDEN_TABLES) {
    it(`⚠ ${table} declares no latitude or longitude column`, () => {
      // Alter table public.shop add column latitude …
      const altered = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(".", "\\.")}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(latitude|longitude|lat|lng)\\b`,
        "i",
      );
      expect(sql, `${table} must not gain a coordinate column`).not.toMatch(altered);

      // Create table public.vehicle ( … latitude numeric … )
      const created = new RegExp(`CREATE\\s+TABLE\\s+${table.replace(".", "\\.")}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
      const body = sql.match(created)?.[1] ?? "";
      expect(body, `${table}'s definition must not contain a coordinate column`).not.toMatch(
        /^\s*(latitude|longitude|lat|lng)\s/im,
      );
    });
  }
});
