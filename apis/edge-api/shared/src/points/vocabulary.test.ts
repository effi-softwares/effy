import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AUTO_CREDIT_REASONS, CREDIT_KINDS, customerWords, DEBIT_KINDS, isValidReason, STAFF_CREDIT_REASONS, STAFF_DEBIT_REASONS,
} from "./vocabulary";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = resolve(here, "../../../../../db/migrations");

/** The reason list the database CHECK on points_entry holds, read from the LAST migration that sets it. */
function reasonsInSchema(): string[] {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
  let found: string[] = [];
  for (const f of files) {
    const up = readFileSync(join(migrations, f), "utf8").split(/^--\s*\+goose\s+Down/m)[0]!;
    const m = /reason\s+text\s+NOT NULL CHECK \(reason IN \(([\s\S]*?)\)\)/.exec(up.slice(up.indexOf("points_entry")));
    if (up.includes("CREATE TABLE public.points_entry") && m) found = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  }
  return found.sort();
}

describe("074 — points vocabulary", () => {
  it("accepts only each kind's own reasons", () => {
    expect(isValidReason("staff_credit", "late_delivery")).toBe(true);
    expect(isValidReason("staff_credit", "credited_in_error")).toBe(false);
    expect(isValidReason("staff_debit", "credited_in_error")).toBe(true);
    expect(isValidReason("staff_debit", "goodwill")).toBe(false);
    expect(isValidReason("auto_credit", "courier_override_compensation")).toBe(true);
    expect(isValidReason("auto_credit", "goodwill")).toBe(false);
    expect(isValidReason("spent", "spent")).toBe(true);
    expect(isValidReason("returned", "goodwill")).toBe(false);
  });

  it("the code's reasons are exactly the database CHECK's", () => {
    const code = [...new Set([...STAFF_CREDIT_REASONS, ...STAFF_DEBIT_REASONS, ...AUTO_CREDIT_REASONS, "spent", "returned", "expired", "forfeited"])].sort();
    expect(reasonsInSchema()).toEqual(code);
  });

  it("every kind has customer words, and a staff note never reaches them", () => {
    for (const kind of [...CREDIT_KINDS, ...DEBIT_KINDS]) {
      const reason = kind === "staff_credit" ? "other" : kind === "auto_credit" ? "courier_override_compensation" : kind === "staff_debit" ? "correction" : kind;
      expect(customerWords(kind, reason, "EFY-ABC123")).not.toBe("");
    }
    expect(customerWords("staff_credit", "late_delivery", null)).toBe("Sorry your order was late");
    expect(customerWords("spent", "spent", "EFY-ABC123")).toBe("Used on order EFY-ABC123");
    expect(customerWords("staff_debit", "credited_in_error", null)).toBe("Balance correction");
  });
});
