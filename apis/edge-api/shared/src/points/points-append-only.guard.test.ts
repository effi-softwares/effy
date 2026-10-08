import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE GUARD FOR THE POINTS LEDGER (074 FR-003, quickstart P13).
 *
 * `points_entry` and `points_allocation` are the record that VALUE MOVED. They are never updated and
 * never deleted — a mistake is corrected by a further entry — and only `@effy/edge-shared/points`
 * writes them at all. The balance is derived from them (research R1), so a stray UPDATE would silently
 * change what a customer holds with no history line to say so.
 *
 * ⚠ A SOURCE SCAN, NOT A TRIGGER — the platform's convention (refund, stock_movement, audit_log). The
 * shopper role additionally has UPDATE and DELETE revoked on both tables in the migration.
 */

const edgeApi = resolve(__dirname, "../../..");
const LEDGER_HOME = "shared/src/points/";

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) yield full;
  }
}

const files = [...sources(edgeApi)].map((f) => ({ rel: relative(edgeApi, f), text: readFileSync(f, "utf8") }));

const LEDGER_TABLES = "points_entry|points_allocation";
const DESTRUCTIVE = new RegExp(`\\b(UPDATE|DELETE\\s+FROM|TRUNCATE)\\s+(public\\.)?(${LEDGER_TABLES})\\b`, "i");
const INSERT = new RegExp(`\\bINSERT\\s+INTO\\s+(public\\.)?(${LEDGER_TABLES})\\b`, "i");

describe("074 — the points ledger is append-only and has one writer", () => {
  it("found the source tree (the guard must not pass vacuously)", () => {
    expect(files.some((f) => f.rel === "shared/src/points/ledger.ts")).toBe(true);
  });

  it("nothing updates, deletes or truncates an entry or an allocation", () => {
    expect(files.filter((f) => DESTRUCTIVE.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("only the shared points module inserts into the ledger", () => {
    expect(files.filter((f) => INSERT.test(f.text) && !f.rel.startsWith(LEDGER_HOME)).map((f) => f.rel)).toEqual([]);
  });
});
