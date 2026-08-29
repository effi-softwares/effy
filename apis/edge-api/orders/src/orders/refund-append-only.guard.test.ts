import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE GUARD FOR `public.refund` — APPEND-ONLY EXCEPT FOR THE STATE MACHINE (055).
 *
 * 054's mechanism, second outing. `refund` is the record that MONEY MOVED — it is the only child of
 * an order with `ON DELETE RESTRICT`, precisely so it cannot vanish with the row it points at. Its
 * status, failure reason, provider id and settled_at change as the money moves; NOTHING ELSE DOES,
 * and no row is ever deleted.
 *
 * ⚠ WHY A SOURCE SCAN RATHER THAN A TRIGGER: the platform's convention for `fulfillment_event`,
 * `admin.audit_log` and `stock_movement` is discipline, not a trigger. Discipline nothing checks is a
 * comment — so this reads the source and fails NAMING the file.
 *
 * ⚠ WHY THE PERMITTED SET IS TIGHT: an UPDATE that touched `amount` would rewrite what a customer was
 * refunded after the fact, and the receipt they hold would no longer match the record. An UPDATE that
 * touched `order_id` would move a refund onto somebody else's order.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

/** Every place on the platform that could plausibly write this table. */
const SEARCH_ROOTS = [
  "apis/core-api/internal",
  "apis/edge-api/orders/src",
  "apis/edge-api/admin/src",
  "apis/edge-api/customer/src",
  "apis/edge-api/shop/src",
];

/** Any DELETE or TRUNCATE is an offence outright — a refund row is never removed. */
const DESTRUCTIVE = /\b(DELETE\s+FROM|TRUNCATE)\s+(public\.)?refund\b/i;

/**
 * The columns an UPDATE may set. Everything here is part of the money MOVING; nothing here changes
 * what the refund WAS.
 */
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
    } else if (/\.(ts|go)$/.test(entry) && !/\.test\.ts$|_test\.go$/.test(entry)) {
      yield full;
    }
  }
}

/** The columns an `UPDATE public.refund` statement assigns, read from the source text. */
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
      `public.refund records that MONEY MOVED. A row is never removed — it is the only child of an ` +
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
        `rewrite what a customer was refunded after the fact — the receipt they hold would no longer ` +
        `match the record. Changing 'order_id' would move a refund onto somebody else's order:\n\n` +
        `  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("is actually looking at source — a guard that scans nothing always passes", () => {
    // ⚠ The failure mode of a source-scanning guard is finding no files and reporting success.
    const files = [...sourceFiles(join(repoRoot, "apis/core-api/internal"))];
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("refunds/repository.go"))).toBe(true);
    // And it must actually be finding the real UPDATE statements, or the column check is vacuous.
    const repo = readFileSync(join(repoRoot, "apis/core-api/internal/features/refunds/repository.go"), "utf8");
    expect(assignedColumns(repo).length).toBeGreaterThan(0);
  });
});
