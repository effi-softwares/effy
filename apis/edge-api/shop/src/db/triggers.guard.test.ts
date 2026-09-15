import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE TRIGGER ALLOW-LIST (058, research R6).
 *
 * ⚠ 058 introduced the platform's first database triggers, and the reason they are acceptable is
 * narrow: they do exactly two things — notify an open console, and mark an analytics bucket for
 * recomputation — inside the transaction that made the change, so no writer on either backend can
 * forget them. That justification survives only while it stays true. A trigger that grew a business
 * rule would be logic living where nobody looks for it: invisible to `tsc`, invisible in a code
 * review of the service that "owns" the table, and running inside someone else's transaction —
 * including the payment transaction, where a failure would refuse a customer's money.
 *
 * So this guard reads THE MIGRATIONS THEMSELVES and fails, naming the function, if:
 *   1. a trigger is attached to a function that is not in the allow-list below, or
 *   2. a trigger function's body does anything other than the permitted statements.
 *
 * It is a SOURCE guard on purpose — it runs everywhere, with no database and no Docker, which is
 * the difference between a rule that is enforced and one that is enforced when someone remembers to
 * start a container. The container test beside it proves the behaviour; this proves the boundary.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../../../db/migrations");

/** Every trigger function the platform is allowed to have, and why it exists. */
const ALLOWED: Record<string, string> = {
  shop_ops_portion_changed: "058: poke the shop; mark the bucket when a portion is declared unfulfillable/withdrawn",
  shop_ops_item_changed: "058: poke the shop when pick progress changes",
  shop_ops_product_changed: "058: poke the shop when stock or availability changes",
  shop_ops_order_status_changed: "058: poke + mark the paid hour for every shop on the order",
  shop_ops_refund_changed: "058: poke + mark the hour the refund was issued",
  shop_ops_dismissal_added: "058: poke the shop when a proposed refund is dismissed",
};

/**
 * What a trigger function may contain. Anything that writes to an operational table, executes
 * dynamic SQL, or reaches outside the database is refused — those are the shapes that turn a
 * notification into a side effect nobody expects.
 */
const BANNED = [
  { re: /\bINSERT\s+INTO\s+(?!public\.insights_dirty)/i, why: "writes to a table other than insights_dirty" },
  { re: /\bUPDATE\s+public\./i, why: "updates an operational table" },
  { re: /\bDELETE\s+FROM\b/i, why: "deletes rows" },
  { re: /\bTRUNCATE\b/i, why: "truncates a table" },
  { re: /\bEXECUTE\s+format\b|\bEXECUTE\s+'/i, why: "runs dynamic SQL" },
  { re: /\bpg_sleep\b/i, why: "sleeps inside someone else's transaction" },
  { re: /\bCOPY\b/i, why: "moves data in bulk" },
  { re: /\bRAISE\s+EXCEPTION\b/i, why: "can abort the caller's transaction — including a payment" },
];

function migrationSql(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this guard would pass vacuously");
  return files.map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
}

/** `CREATE FUNCTION public.x() RETURNS trigger … AS $$ body $$` → { name: body }. */
function triggerFunctionBodies(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(\s*\)\s+RETURNS\s+trigger[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$;/gi;
  for (let m = re.exec(sql); m; m = re.exec(sql)) out.set(m[1]!, m[2]!);
  return out;
}

/** Every function a CREATE TRIGGER actually attaches (a body nothing fires is not a trigger). */
function attachedFunctions(sql: string): Set<string> {
  const out = new Set<string>();
  const re = /CREATE\s+TRIGGER\s+\w+[\s\S]*?EXECUTE\s+FUNCTION\s+public\.(\w+)\s*\(/gi;
  for (let m = re.exec(sql); m; m = re.exec(sql)) out.add(m[1]!);
  return out;
}

/** Comments are prose, not behaviour — strip them before looking for statements (057's guard lesson). */
function stripComments(body: string): string {
  return body.replace(/--[^\n]*/g, " ");
}

describe("database triggers stay inside their justification", () => {
  const sql = migrationSql();

  it("attaches only allow-listed trigger functions", () => {
    const unexpected = [...attachedFunctions(sql)].filter((name) => !(name in ALLOWED));
    expect(
      unexpected,
      `Unexpected database trigger(s): ${unexpected.join(", ")}. A trigger runs inside another ` +
        `service's transaction and is invisible to every code review of that service. If this one is ` +
        `genuinely needed, add it to ALLOWED in this file with the reason, and say so in the plan's ` +
        `Complexity Tracking — do not delete this assertion.`,
    ).toEqual([]);
  });

  it("every allow-listed function actually exists in the migrations", () => {
    const bodies = triggerFunctionBodies(sql);
    const missing = Object.keys(ALLOWED).filter((n) => !bodies.has(n));
    expect(missing, `Allow-listed but not defined: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(Object.keys(ALLOWED))("%s only notifies and marks buckets dirty", (name) => {
    const body = triggerFunctionBodies(sql).get(name);
    expect(body, `${name} is allow-listed but has no body in the migrations`).toBeTruthy();
    const code = stripComments(body!);
    for (const { re, why } of BANNED) {
      expect(
        re.test(code),
        `Trigger function ${name} ${why}. Trigger bodies are limited to pg_notify and an ` +
          `ON CONFLICT DO NOTHING insert into insights_dirty (research R6) — anything else belongs ` +
          `in the service that owns the write.`,
      ).toBe(false);
    }
  });

  it("the notify channel is the UI one, and carries only a shop id", () => {
    const helper = triggerFunctionBodies(sql).get("shop_ops_portion_changed") ?? "";
    expect(sql).toContain("pg_notify('shop_ops'");
    // A payload with anything but the shop id would make this a data channel — and then a consumer
    // would grow that reads business facts off a best-effort, non-durable notification (research R19).
    const payloads = [...sql.matchAll(/pg_notify\(\s*'shop_ops'\s*,\s*([^)]+)\)/g)].map((m) => m[1]!.trim());
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(
        p,
        `The shop_ops payload must be the shop id alone — it is a cache-invalidation hint, not the ` +
          `event backbone (Principle VI, research R19).`,
      ).toMatch(/^p_shop_id::text$/);
    }
    expect(helper).toContain("shop_ops_poke");
  });
});
