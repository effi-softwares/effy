import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ⚠ THE PLATFORM STORES NO COORDINATES, AND THIS IS WHAT KEEPS IT THAT WAY (061, FR-031).
 *
 * The operator's decision (D20) is that sequencing is an ORDERING problem — task status, time, zone,
 * shop — not a geometry problem. Nothing computes distance, so a `latitude`/`longitude` pair on a
 * shop or a vehicle would be read by NOTHING.
 *
 * ⚠ A COLUMN NOTHING READS IS NOT HARMLESS. It is a design decision made in advance for a feature
 * nobody has specified, and this programme exists because three of them accumulated:
 *   · `driver.delivery_zone_id`, declared "inert for assignment" and never read by any assignment code
 *   · `device_token.platform`, an enum quietly contradicting the live contract for two years (059)
 *   · `POST /driver/v1/location` with its three columns — a receiver with no sender
 *
 * So the absence is asserted rather than trusted to review. When something genuinely needs geometry,
 * THAT slice adds the columns and the loader that fills them, together, in one change.
 *
 * ⚠ This reads the MIGRATIONS, not the running database, because a migration is where a column is
 * born. A guard against the live schema would pass right up until the moment someone deployed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "..", "..", "..", "..", "..", "db", "migrations");

/** Tables that must never grow coordinates. ⚠ `public.locality` and `public.delivery_settings`
 *  legitimately HAVE them (047: the hub, and G-NAF suburb centroids) and are not in scope. */
const FORBIDDEN_TABLES = ["public.shop", "public.vehicle"];

function allMigrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(migrationsDir, f), "utf8"))
    .join("\n");
}

/** Strip SQL comments so a column NAMED in prose is not mistaken for one that was declared. */
function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("FR-031 — no coordinates on a shop or a vehicle", () => {
  const sql = withoutComments(allMigrationSql());

  for (const table of FORBIDDEN_TABLES) {
    it(`⚠ ${table} declares no latitude or longitude column`, () => {
      // ALTER TABLE public.shop ADD COLUMN latitude …
      const altered = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(".", "\\.")}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(latitude|longitude|lat|lng)\\b`,
        "i",
      );
      expect(sql, `${table} must not gain a coordinate column`).not.toMatch(altered);

      // CREATE TABLE public.vehicle ( … latitude numeric … )
      const created = new RegExp(`CREATE\\s+TABLE\\s+${table.replace(".", "\\.")}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
      const body = sql.match(created)?.[1] ?? "";
      expect(body, `${table}'s definition must not contain a coordinate column`).not.toMatch(
        /^\s*(latitude|longitude|lat|lng)\s/im,
      );
    });
  }
});
