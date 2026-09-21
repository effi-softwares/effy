import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Apply the platform's REAL migrations to a test database (063).
 *
 * ⚠ THE ALTERNATIVE IS A TRANSCRIPTION, AND A TRANSCRIPTION DRIFTS. Existing container tests here
 * hand-copy a ~160-line schema into the test file. That is fine until a migration changes a column
 * the transcription still declares the old way — at which point the container test passes against a
 * schema that no longer exists anywhere, which is worse than having no container test at all,
 * because it looks like proof.
 *
 * Reading `db/migrations` means the test fails the moment the real schema and the code disagree,
 * which is the only thing it was ever for.
 *
 * ⚠ Goose's `StatementBegin` / `StatementEnd` markers are comments to PostgreSQL, so an Up section
 * can be executed verbatim. Only the Down half is stripped.
 */
export function migrationSql(): string {
  const dir = resolve(__dirname, "../../../../../db/migrations");
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
