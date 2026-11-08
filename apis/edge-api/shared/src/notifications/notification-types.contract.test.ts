import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KNOWN_SHOP_NOTIFICATION_TYPES } from "../lib/notification-types";
import { NOTIFICATION_TYPES, catalogueEntry } from "./catalogue";

/**
 * 109 R15 - the type list lives in three places: the database CHECK, the catalogue, and the shop's settings list.
 * They must agree, or a writer is refused by the database at run time (or a type ships with no words).
 */
const here = dirname(fileURLToPath(import.meta.url));
const migrations = resolve(here, "../../../../../db/migrations");

/** The newest migration that (re)defines `notification_type_check`, and the types it allows. */
function databaseTypes(): { file: string; types: string[] } {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const sql = readFileSync(resolve(migrations, file), "utf8");
    const up = sql.split(/--\s*\+goose Down/)[0] ?? "";
    const m = /CONSTRAINT\s+notification_type_check\s+CHECK\s*\(\s*type\s*=\s*ANY\s*\(\s*ARRAY\[([\s\S]*?)\]/.exec(up);
    if (m) return { file, types: [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!) };
  }
  throw new Error("no migration defines notification_type_check");
}

describe("109 - one list of notification types", () => {
  it("the database allows exactly the catalogue's types", () => {
    const db = databaseTypes();
    expect([...db.types].sort(), db.file).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it("every shop type in the settings list is a shop type in the catalogue, and none is missing", () => {
    const shopInCatalogue = NOTIFICATION_TYPES.filter((t) => catalogueEntry(t).audience === "shop");
    expect([...KNOWN_SHOP_NOTIFICATION_TYPES].sort()).toEqual([...shopInCatalogue].sort());
  });
});
