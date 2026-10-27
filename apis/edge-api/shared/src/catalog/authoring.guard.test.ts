import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * One writer of a new product (102): the shop's form, Effy's form and an import all create a product through
 * `authoring.ts` `insertProduct`, so a product is never made by rules other than the form's.
 */

const EDGE_API = fileURLToPath(new URL("../../..", import.meta.url));
const SERVICES = readdirSync(EDGE_API).filter((d) => statSync(join(EDGE_API, d)).isDirectory() && d !== "node_modules");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    // Test fixtures (src/testing) write rows directly and ship in no service.
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !full.includes("/src/testing/")) out.push(full);
  }
  return out;
}

const files = SERVICES.flatMap((s) => {
  const src = join(EDGE_API, s, "src");
  try {
    return statSync(src).isDirectory() ? sourceFiles(src) : [];
  } catch {
    return [];
  }
});

describe("102 — one writer of a new product", () => {
  it("scans the backend", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("only authoring.ts inserts into public.product", () => {
    const offenders = files
      .filter((f) => !f.endsWith("shared/src/catalog/authoring.ts"))
      .filter((f) => /INSERT\s+INTO\s+public\.product\s*\(/i.test(readFileSync(f, "utf8")))
      .map((f) => relative(EDGE_API, f));
    expect(offenders, "create a product through insertProduct (@effy/edge-shared/catalog)").toEqual([]);
  });
});
