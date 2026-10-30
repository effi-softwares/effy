import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `public.stock_movement` is append-only: the history must account for every count change. */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

const SEARCH_ROOTS = [
  "apis/edge-api/inventory/src",
  "apis/edge-api/shop/src",
  "apis/edge-api/admin/src",
  "apis/edge-api/shared/src",
  "apis/edge-api/commerce/src",
  "apis/edge-api/orders/src",
];

const MUTATION = /\b(UPDATE|DELETE\s+FROM|TRUNCATE)\s+(public\.)?stock_movement\b/i;

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".serverless" || entry === ".esbuild") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      yield full;
    }
  }
}

describe("stock_movement is append-only (FR-008)", () => {
  it("has no UPDATE, DELETE or TRUNCATE against it anywhere in the platform", () => {
    const offences: string[] = [];

    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const body = readFileSync(file, "utf8");
        body.split("\n").forEach((line, i) => {
          if (MUTATION.test(line)) {
            offences.push(`${file.slice(repoRoot.length + 1)}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }

    expect(
      offences,
      `public.stock_movement is APPEND-ONLY (FR-008). A row, once written, is never edited or ` +
      `deleted - the current count must always be explicable from the history (SC-005), and an ` +
      `edit makes that false forever with no way to detect it afterwards. Correct a mistake by ` +
      `writing another movement:\n\n  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("is actually looking at source - a guard that scans nothing always passes", () => {
    // Pins that the walk reaches the owning repository, so finding no files cannot pass.
    const files = [...sourceFiles(join(repoRoot, "apis/edge-api/inventory/src"))];
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("repository.ts"))).toBe(true);
  });
});
