import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A shop never reads Effy's margin by accident (a `SELECT p.*`, a product row, an export). A shop can
 * subtract its two prices; that is accepted. This scans every shop source file for the margin columns.
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

describe("067 - the shop service never references Effy's margin", () => {
  it("no edge-api/shop source file names the margin columns or fields", () => {
    const files = sourceFiles(join(EDGE_API, "shop", "src"));
    expect(files.length).toBeGreaterThan(10);

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
