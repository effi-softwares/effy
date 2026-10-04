import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ A SHOP IS NEVER TOLD WHEN THE CUSTOMER'S DELIVERY IS (069 contract §5, research R2).
 *
 * From 069 an order carries the customer's delivery day and, for same-day, a time window. Neither is
 * the shop's business, and one of them is actively harmful there: a shop shown "Thursday" on an
 * order placed Monday will reasonably pick it on Thursday — but a standard package waits at the HUB,
 * not at the shop, and must be picked now. The shop's own ready-by (`promised_ready_at`, and the
 * rule in `promise.ts`) is untouched by 069 for exactly that reason.
 *
 * So no file in this service may read the columns that carry the customer's promise. This is a guard
 * over SOURCE, because the failure it prevents produces no error: the query would run, the console
 * would render a date, and the shop would simply start working to the wrong one.
 */

const ROOT = resolve(__dirname, "..");

/** The customer's promise: where it is stored, and the tables that exist only to carry it. */
const FORBIDDEN = [
  /\bwindow_start\b/,
  /\bwindow_end\b/,
  /\bslot_id\b/,
  /\bpromised_from\b/,
  /\bpromised_to\b/,
  /\bdelivery_slot\b/,
  /\bdelivery_slot_booking\b/,
  /\bdelivery_slot_load\b/,
  /\bdelivery_non_delivery_date\b/,
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/** Comments may NAME a column to say why it is not read; only code may not read it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
}

describe("the shop service never reads the customer's delivery promise (069)", () => {
  const files = sources(ROOT);

  it("finds the service (a guard over nothing guards nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no source file reads the delivery day, the window, or the slot tables", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(code)) offenders.push(`${file.slice(ROOT.length + 1)} reads ${pattern.source}`);
      }
    }
    expect(
      offenders,
      "A shop must not be shown the customer's delivery day or window. It picks to its own ready-by " +
        "(promise.ts); a standard package waits at the hub, not at the shop.",
    ).toEqual([]);
  });

  it("still reads its OWN ready-by — the guard must not have been satisfied by deleting the promise", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).toMatch(/promised_ready_at/);
  });
});
