import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The real migrations' Up halves, so a test fails the moment schema and code disagree (a transcribed
 * schema drifts and still looks like proof). Finds `db/migrations` by walking up, so any importer's depth works.
 */
export function migrationSql(): string {
  const dir = findMigrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`no migrations found at ${dir} — the container test would prove nothing`);
  return files
    .map((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      const up = sql.indexOf("-- +goose Up");
      const down = sql.indexOf("-- +goose Down");
      if (up === -1) throw new Error(`${f} has no "-- +goose Up" section`);
      // A `NO TRANSACTION` migration builds indexes CONCURRENTLY, which cannot run inside the one multi-statement
      // query this returns; on a test database's empty tables a plain build is the same index.
      return sql.slice(up, down === -1 ? undefined : down).replace(/\bINDEX CONCURRENTLY\b/g, "INDEX");
    })
    .join("\n\n");
}

/**
 * Lists a postcode on Effy's coverage list (`$1` group or null, `$2` postcode) at an arbitrary 5 km,
 * so fixtures in services forbidden to mention distance (the planner's no-location guard) can list one.
 */
export const LISTED_POSTCODE_FIXTURE_SQL = `
  INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
  VALUES ($1, $2, 5, 'manual', 'test')`;

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
