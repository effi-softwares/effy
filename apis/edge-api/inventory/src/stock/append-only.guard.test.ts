import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE GUARD FOR FR-008 — `public.stock_movement` IS APPEND-ONLY.
 *
 * data-model §2 chose discipline over a database trigger, following the platform's existing
 * convention for `fulfillment_event` and `admin.audit_log`. Discipline that nothing checks is a
 * comment, and this is the table SC-005 rests on: "the movement history fully accounts for the
 * difference between a product's opening and current count". One `UPDATE` against it and that stops
 * being true, permanently and silently — the history cannot be reconstructed after the fact.
 *
 * So it is made mechanical the same way FR-012's one-rule guard is: read the source, fail NAMING the
 * file. Proven by breaking it (quickstart §2).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

/** Every place on the platform that could plausibly write this table. */
const SEARCH_ROOTS = [
  "apis/edge-api/inventory/src",
  "apis/edge-api/shop/src",
  "apis/edge-api/admin/src",
  "apis/core-api/internal",
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
    } else if (/\.(ts|go)$/.test(entry) && !/\.test\.ts$|_test\.go$/.test(entry)) {
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
        `deleted — the current count must always be explicable from the history (SC-005), and an ` +
        `edit makes that false forever with no way to detect it afterwards. Correct a mistake by ` +
        `writing another movement:\n\n  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("is actually looking at source — a guard that scans nothing always passes", () => {
    // ⚠ The failure mode of a source-scanning guard is finding no files and reporting success. This
    // pins that the walk reaches the repository that owns the table.
    const files = [...sourceFiles(join(repoRoot, "apis/edge-api/inventory/src"))];
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("repository.ts"))).toBe(true);
  });
});
