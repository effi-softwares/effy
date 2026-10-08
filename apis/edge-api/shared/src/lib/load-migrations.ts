import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Apply the platform's REAL migrations to a test database.
 *
 * ⚠ THE ALTERNATIVE IS A TRANSCRIPTION, AND A TRANSCRIPTION DRIFTS. Older container tests hand-copy
 * a ~160-line schema into the test file. That is fine until a migration changes a column the
 * transcription still declares the old way — at which point the container test passes against a
 * schema that no longer exists anywhere, which is WORSE than having no container test at all,
 * because it looks like proof. When 063 first loaded the real migrations instead, it surfaced ten
 * fixture errors at once.
 *
 * Reading `db/migrations` means the test fails the moment the real schema and the code disagree,
 * which is the only thing it was ever for.
 *
 * ── ⚠ PROMOTED FROM apis/edge-api/fleet/src/shared/load-migrations.ts BY 064 ────────────────────
 *
 * Written for the fleet service by 063; 064 needs the identical thing in `edge-api/driver` to prove
 * its new constraints. Copying it would be exactly the cross-cutting duplication Principle II
 * prohibits — two loaders that agree about Goose's section markers today and drift the first time
 * either is touched.
 *
 * One thing changed in the move, and only one: the migrations directory is found by **walking up**
 * from this file rather than by a fixed `../../../../../` hop. The old relative path was correct for
 * exactly one nesting depth, and a shared module is imported from several — a wrong hop would throw
 * "no migrations found" and read as an environment problem rather than a path bug.
 *
 * ⚠ Goose's `StatementBegin` / `StatementEnd` markers are comments to PostgreSQL, so an Up section
 * can be executed verbatim. Only the Down half is stripped.
 */
export function migrationSql(range: MigrationRange = {}): string {
  const dir = findMigrationsDir();

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort() // timestamp-prefixed, so lexical order is chronological order
    .filter((f) => (range.before === undefined || f < range.before) && (range.from === undefined || f >= range.from));

  if (files.length === 0) {
    throw new Error(`no migrations found at ${dir} — the container test would prove nothing`);
  }

  return files
    .map((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      const up = sql.indexOf("-- +goose Up");
      const down = sql.indexOf("-- +goose Down");
      if (up === -1) throw new Error(`${f} has no "-- +goose Up" section`);
      return sql.slice(up, down === -1 ? undefined : down);
    })
    .join("\n\n");
}

/**
 * Part of the chain, by file-name prefix (076). `before` stops short of a migration and `from`
 * starts at one — so a test can build the schema as it was, put data in it, then apply the
 * migration under test and prove what it did to that data. A migration tested only against an
 * EMPTY database has had its DDL checked and its backfill not run at all.
 */
export interface MigrationRange {
  /** Apply only files that sort BEFORE this prefix, e.g. `"20261008114600"`. */
  before?: string;
  /** Apply only files that sort AT OR AFTER this prefix. */
  from?: string;
}

/**
 * A fixture statement that puts a postcode on Effy's coverage list (076): `$1` = its group (or
 * NULL), `$2` = the postcode.
 *
 * ⚠ WHY A TEST FIXTURE LIVES IN A SHARED MODULE. Since 076 a listed postcode must carry a distance,
 * so every fixture that lists one has to name that column — including fixtures in services that are
 * forbidden to know distance exists. The dispatch planner is one: `no-location.guard.test.ts` fails
 * any file in `fleet` or `driver` that mentions it, because the planner sequences by ORDER and a
 * distance tie-break must never creep back in. The guard is right and stays whole; the planner's
 * fixtures list a postcode through this instead of spelling out a column they have no business
 * reading. The distance is an arbitrary 5 km, entered "by hand".
 */
export const LISTED_POSTCODE_FIXTURE_SQL = `
  INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
  VALUES ($1, $2, 5, 'manual', 'test')`;

/** Walk up from this file until `db/migrations` appears — depth-independent (see the note above). */
function findMigrationsDir(): string {
  let cur = __dirname;
  for (let i = 0; i < 12; i += 1) {
    const candidate = resolve(cur, "db", "migrations");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`could not locate db/migrations by walking up from ${__dirname}`);
}
