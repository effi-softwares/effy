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
// ⚠ 070: the writer is `shared/src/payments` now (it was the Go backend). Every service is listed,
// not only the three that move money — the guard exists to catch a write from somewhere it should
// not be, which is by definition a place nobody thought to list.
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

/** Where the refund state machine lives. The floor checks below are anchored on it. */
const REFUND_REPOSITORY = "apis/edge-api/shared/src/payments/refunds/repository.ts";

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
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
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
    for (const root of SEARCH_ROOTS) {
      expect([...sourceFiles(join(repoRoot, root))].length, `${root} has no source — was it moved?`).toBeGreaterThan(0);
    }
    const files = [...sourceFiles(join(repoRoot, "apis/edge-api/shared/src"))];
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.endsWith("payments/refunds/repository.ts"))).toBe(true);

    // And it must be finding the real UPDATE statements, or the column check is vacuous: the three
    // transitions (submitted, refused, settled) and nothing that is not one of them.
    const found = assignedColumns(readFileSync(join(repoRoot, REFUND_REPOSITORY), "utf8"));
    expect(found).toHaveLength(3);
    expect(new Set(found.flatMap((f) => f.columns))).toEqual(MUTABLE);
  });

  it("every transition names the states it may leave — a settled refund is never reopened", () => {
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
    // Money logic lives once (070). A second writer is a second definition of what a refund is.
    expect([...writers]).toEqual([REFUND_REPOSITORY]);
  });
});
