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
export function migrationSql(): string {
  const dir = findMigrationsDir();

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // timestamp-prefixed, so lexical order is chronological order

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
