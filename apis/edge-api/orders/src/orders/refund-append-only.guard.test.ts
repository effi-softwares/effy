import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `public.refund` is append-only apart from its state machine: only the columns that record money
 * moving may be updated, and no row is ever deleted. A source scan that fails naming the file.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

/** Every service, not just the money movers: the guard catches a write from an unexpected place. */
const SEARCH_ROOTS = [
  "apis/edge-api/shared/src",
  "apis/edge-api/commerce/src",
  "apis/edge-api/orders/src",
  "apis/edge-api/shop/src",
  "apis/edge-api/admin/src",
  "apis/edge-api/customer/src",
  "apis/edge-api/storefront/src",
  "apis/edge-api/driver/src",
  "apis/edge-api/fleet/src",
  "apis/edge-api/catalog/src",
  "apis/edge-api/inventory/src",
  "apis/edge-api/notifications/src",
];

const REFUND_REPOSITORY = "apis/edge-api/shared/src/payments/refunds/repository.ts";

const DESTRUCTIVE = /\b(DELETE\s+FROM|TRUNCATE)\s+(public\.)?refund\b/i;

/** Columns that record the money moving; none change what the refund was. */
const MUTABLE = new Set(["status", "failure_reason", "provider_refund_id", "settled_at"]);

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

function assignedColumns(body: string): { columns: string[]; where: string }[] {
  const out: { columns: string[]; where: string }[] = [];
  const re = /UPDATE\s+public\.refund\b([\s\S]*?)(?:`|;|\n\s*\n)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const stmt = m[1] ?? "";
    const setPart = /SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i.exec(stmt)?.[1] ?? "";
    const columns = [...setPart.matchAll(/(?:^|,)\s*([a-z_]+)\s*=/gi)].map((c) => c[1]!.toLowerCase());
    out.push({ columns, where: stmt });
  }
  return out;
}

describe("public.refund is append-only except for its state machine (055)", () => {
  it("is never deleted or truncated anywhere on the platform", () => {
    const offences: string[] = [];
    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (DESTRUCTIVE.test(line)) {
              offences.push(`${file.slice(repoRoot.length + 1)}:${i + 1}  ${line.trim()}`);
            }
          });
      }
    }
    expect(
      offences,
      `public.refund records that MONEY MOVED. A row is never removed - it is the only child of an ` +
      `order with ON DELETE RESTRICT for exactly that reason:\n\n  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("is only ever updated on the columns the money-movement state machine owns", () => {
    const offences: string[] = [];
    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        for (const { columns } of assignedColumns(readFileSync(file, "utf8"))) {
          const illegal = columns.filter((c) => !MUTABLE.has(c));
          if (illegal.length > 0) {
            offences.push(`${file.slice(repoRoot.length + 1)}  sets ${illegal.join(", ")}`);
          }
        }
      }
    }
    expect(
      offences,
      `Only ${[...MUTABLE].join(", ")} may be updated on public.refund. Changing 'amount' would ` +
      `rewrite what a customer was refunded after the fact - the receipt they hold would no longer ` +
      `match the record. Changing 'order_id' would move a refund onto somebody else's order:\n\n` +
      `  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("is actually looking at source - a guard that scans nothing always passes", () => {
    // A source scan that finds no files must not pass.
    for (const root of SEARCH_ROOTS) {
      expect([...sourceFiles(join(repoRoot, root))].length, `${root} has no source - was it moved?`).toBeGreaterThan(0);
    }
    const files = [...sourceFiles(join(repoRoot, "apis/edge-api/shared/src"))];
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.endsWith("payments/refunds/repository.ts"))).toBe(true);

    // It must find the three real transitions, or the column check is vacuous.
    const found = assignedColumns(readFileSync(join(repoRoot, REFUND_REPOSITORY), "utf8"));
    expect(found).toHaveLength(3);
    expect(new Set(found.flatMap((f) => f.columns))).toEqual(MUTABLE);
  });

  it("every transition names the states it may leave - a settled refund is never reopened", () => {
    for (const { where } of assignedColumns(readFileSync(join(repoRoot, REFUND_REPOSITORY), "utf8"))) {
      expect(where, "an UPDATE on public.refund with no status guard can reopen a terminal refund").toMatch(
        /status (= 'submitting'|IN \('submitting', 'submitted'\))/,
      );
    }
  });

  it("has exactly one writer of the table", () => {
    const writers = new Set<string>();
    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        if (/(INSERT\s+INTO|UPDATE)\s+public\.refund\b/i.test(readFileSync(file, "utf8"))) writers.add(file.slice(repoRoot.length + 1));
      }
    }
    expect([...writers]).toEqual([REFUND_REPOSITORY]);
  });
});
