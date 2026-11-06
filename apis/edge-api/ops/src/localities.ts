/**
 * Idempotent on (name, state, postcode). A row the table refuses fails the whole load: a silent
 * drop would hide a corrupt file.
 */
import type pg from "pg";

export interface LocalityRow {
  postcode: string;
  name: string;
  state: string;
  /** "" for a locality with no point (stored null). */
  latitude: string;
  longitude: string;
  addressCount: number;
}

/** Comma-separated, optionally "double-quoted" with "" escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const COLUMNS = {
  postcode: ["postcode"],
  name: ["locality", "name", "suburb"],
  state: ["state"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  addressCount: ["address_count", "addresses", "count"],
} as const;

/** Any header order; latitude, longitude and the count are optional. */
export function parseLocalities(csv: string): LocalityRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = parseCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const at = (names: readonly string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const idx = {
    postcode: at(COLUMNS.postcode), name: at(COLUMNS.name), state: at(COLUMNS.state),
    latitude: at(COLUMNS.latitude), longitude: at(COLUMNS.longitude), addressCount: at(COLUMNS.addressCount),
  };
  if (idx.postcode < 0 || idx.name < 0 || idx.state < 0) {
    throw new Error(`header must include postcode, locality/name and state (got ${header.join(",")})`);
  }

  return lines.slice(1).map((line, n) => {
    const rec = parseCsvLine(line);
    const cell = (i: number) => (i < 0 ? "" : (rec[i] ?? ""));
    const count = cell(idx.addressCount);
    if (count !== "" && !/^-?\d+$/.test(count)) throw new Error(`row ${n + 1}: bad address_count "${count}"`);
    return {
      postcode: cell(idx.postcode), name: cell(idx.name), state: cell(idx.state).toUpperCase(),
      latitude: cell(idx.latitude), longitude: cell(idx.longitude), addressCount: count === "" ? 0 : Number(count),
    };
  });
}

export interface LoadOptions {
  /** Empty the table first, in the same transaction: the table ends up holding exactly the file. */
  replace?: boolean;
  /** Called once with 0 before the first batch, then after every batch, with rows done and the total. */
  onProgress?: (done: number, total: number) => void;
}

const BATCH = 1000;

const UPSERT = `
INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count)
SELECT name, state, postcode, NULLIF(lat, '')::numeric, NULLIF(lng, '')::numeric, n
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
       AS r (name, state, postcode, lat, lng, n)
ON CONFLICT (name, state, postcode) DO UPDATE
SET latitude      = EXCLUDED.latitude,
    longitude     = EXCLUDED.longitude,
    address_count = EXCLUDED.address_count`;

function params(rows: readonly LocalityRow[]): unknown[] {
  return [
    rows.map((r) => r.name), rows.map((r) => r.state), rows.map((r) => r.postcode),
    rows.map((r) => r.latitude), rows.map((r) => r.longitude), rows.map((r) => r.addressCount),
  ];
}

/**
 * One transaction, BATCH rows per statement. A batch the table refuses is retried row by row to name the row,
 * then the whole load rolls back.
 */
export async function loadLocalities(
  db: Pick<pg.Client, "query">,
  csv: string,
  options: LoadOptions = {},
): Promise<{ read: number; upserted: number }> {
  const rows = parseLocalities(csv);
  // A triple twice in one statement is refused by ON CONFLICT; the later line wins, as it did row by row.
  const unique = [...new Map(rows.map((r, i) => [`${r.name}\u0000${r.state}\u0000${r.postcode}`, { r, i }])).values()]
    .sort((a, b) => a.i - b.i);
  const { onProgress } = options;

  await db.query("BEGIN");
  try {
    if (options.replace) await db.query("DELETE FROM public.locality");
    onProgress?.(0, rows.length);
    for (let start = 0; start < unique.length; start += BATCH) {
      const batch = unique.slice(start, start + BATCH);
      await db.query("SAVEPOINT batch");
      try {
        await db.query(UPSERT, params(batch.map((b) => b.r)));
      } catch {
        await db.query("ROLLBACK TO SAVEPOINT batch");
        for (const { r, i } of batch) {
          try {
            await db.query("SAVEPOINT one");
            await db.query(UPSERT, params([r]));
            await db.query("RELEASE SAVEPOINT one");
          } catch (err) {
            throw new Error(`upsert row ${i + 1} (${r.name} ${r.state} ${r.postcode}): ${(err as Error).message}`);
          }
        }
      }
      await db.query("RELEASE SAVEPOINT batch");
      onProgress?.(Math.round(((start + batch.length) / unique.length) * rows.length), rows.length);
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return { read: rows.length, upserted: rows.length };
}
