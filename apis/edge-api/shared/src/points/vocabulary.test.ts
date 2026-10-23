
import { describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";

import {
  AUTO_CREDIT_REASONS, CREDIT_KINDS, customerWords, DEBIT_KINDS, isValidReason, STAFF_CREDIT_REASONS, STAFF_DEBIT_REASONS,
} from "./vocabulary";

/** The reasons the points_entry check holds. */
function reasonsInSchema(): string[] {
  const check = /points_entry_reason_check CHECK \((.*)\),?$/m.exec(migrationSql())?.[1] ?? "";
  return [...check.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort();
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
