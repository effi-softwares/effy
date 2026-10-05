/**
 * Loading the Australian locality reference data (047): the suburb / state / postcode triples that
 * address entry searches.
 *
 * ⚠ IDEMPOTENT on (name, state, postcode): loading the same file twice leaves the table as one
 * load would. ⚠ A row the table refuses (an unknown state, a postcode that is not four digits)
 * FAILS THE LOAD rather than being skipped — the file is the source of truth, and a silent drop
 * would hide a corrupt one.
 */
import type pg from "pg";

export interface LocalityRow {
  postcode: string;
  name: string;
  state: string;
  /** A decimal string, or "" for a locality with no point — stored NULL. */
  latitude: string;
  longitude: string;
  addressCount: number;
}

/** One CSV record: fields separated by commas, a field optionally "double-quoted" with "" escapes. */
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

/** Parse the whole file. The header may be in any order; latitude, longitude and the count are optional. */
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

export async function loadLocalities(db: Pick<pg.Client, "query">, csv: string): Promise<{ read: number; upserted: number }> {
  const rows = parseLocalities(csv);
  let upserted = 0;
  for (const [i, r] of rows.entries()) {
    try {
      await db.query(
        `
INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count)
VALUES ($1, $2, $3, NULLIF($4, '')::numeric, NULLIF($5, '')::numeric, $6)
ON CONFLICT (name, state, postcode) DO UPDATE
SET latitude      = EXCLUDED.latitude,
    longitude     = EXCLUDED.longitude,
    address_count = EXCLUDED.address_count`,
        [r.name, r.state, r.postcode, r.latitude, r.longitude, r.addressCount],
      );
    } catch (err) {
      throw new Error(`upsert row ${i + 1} (${r.name} ${r.state} ${r.postcode}): ${(err as Error).message}`);
    }
    upserted++;
  }
  return { read: rows.length, upserted };
}
