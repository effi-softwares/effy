import { migrationSql } from "@effy/edge-shared/testing";
import { describe, expect, it } from "vitest";

/**
 * The trigger allow-list. Triggers are acceptable only because they mark an analytics bucket for
 * recomputation inside the transaction that made the change; a trigger with a business rule would be logic
 * nobody looks for, running inside someone else's transaction (the payment one included).
 *
 * Reads the migrations and fails, naming the function, if:
 *  1. a trigger is attached to a function that is not in the allow-list below, or
 *  2. a trigger function's body does anything other than the permitted statements.
 * A source guard, so it runs with no database; the container test beside it proves the behaviour.
 */

/** Every trigger function the platform is allowed to have, and why it exists. */
const ALLOWED: Record<string, string> = {
  shop_ops_portion_changed: "058: mark the bucket when a portion is declared unfulfillable/withdrawn",
  shop_ops_order_status_changed: "058: mark the paid hour for every shop on the order",
  shop_ops_refund_changed: "058: mark the hour the refund was issued",
  shop_ops_order_item_added:
    "058 follow-up: mark the bucket when an order's lines appear — covers an order inserted already paid, which the status trigger cannot see",
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
  { re: /\bpg_notify\b|\bNOTIFY\b|shop_ops_poke/i, why: "notifies — withdrawn by 070; nothing listens, and it ran on every pick" },
];

/** `create function public.x returns trigger … AS $$ body $$` → { name: body }. */
function triggerFunctionBodies(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(\s*\)\s+RETURNS\s+trigger[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$;/gi;
  for (let m = re.exec(sql); m; m = re.exec(sql)) out.set(m[1]!, m[2]!);
  return out;
}

/** Every function a create trigger actually attaches (a body nothing fires is not a trigger). */
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

  it.each(Object.keys(ALLOWED))("%s only marks buckets dirty", (name) => {
    const body = triggerFunctionBodies(sql).get(name);
    expect(body, `${name} is allow-listed but has no body in the migrations`).toBeTruthy();
    const code = stripComments(body!);
    for (const { re, why } of BANNED) {
      expect(
        re.test(code),
        `Trigger function ${name} ${why}. Trigger bodies are limited to an ` +
          `ON CONFLICT DO NOTHING insert into insights_dirty (research R6) — anything else belongs ` +
          `in the service that owns the write.`,
      ).toBe(false);
    }
  });
});
