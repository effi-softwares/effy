import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 067 — A SHOP NEVER READS EFFY'S MARGIN (FR-039).
 *
 * A shop sees what it is paid and what the customer pays. The margin — its kind, its value — is
 * Effy's, and lives in two columns no shop-pool query has any reason to select.
 *
 * This is honest about what it protects. A shop that sees both prices can subtract; the operator
 * chose that. What must not happen is the margin reaching a shop BY ACCIDENT: a `SELECT p.*`, a
 * helpful "margin" row on a product screen, a percentage in an Insights export. None of those would
 * fail a test or a typecheck. This reads every source file of the shop service and fails naming the
 * one that references the margin.
 */

const EDGE_API = fileURLToPath(new URL("../..", import.meta.url));
const BANNED = ["margin_kind", "margin_value", "marginKind", "marginValue"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("067 — the shop service never references Effy's margin", () => {
  it("no edge-api/shop source file names the margin columns or fields", () => {
    const files = sourceFiles(join(EDGE_API, "shop", "src"));
    expect(files.length).toBeGreaterThan(10); // a guard that scanned nothing would pass for ever

    const offenders = files
      .filter((f) => {
        const body = readFileSync(f, "utf8");
        return BANNED.some((b) => body.includes(b));
      })
      .map((f) => relative(EDGE_API, f));

    expect(offenders, "these shop files reference Effy's margin").toEqual([]);
  });

  it("never selects every product column, which would carry the margin with it", () => {
    const files = sourceFiles(join(EDGE_API, "shop", "src"));
    const offenders = files
      .filter((f) => /SELECT\s+(p|product)\.\*/i.test(readFileSync(f, "utf8")))
      .map((f) => relative(EDGE_API, f));
    expect(offenders, "SELECT p.* in a shop file would return margin_kind and margin_value").toEqual([]);
  });
});
