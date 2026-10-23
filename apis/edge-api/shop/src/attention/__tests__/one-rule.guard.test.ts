import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The evaluator derives attention with the same functions as the Today screen, so a notification always matches what is listed. */
const SRC = join(import.meta.dirname, "..", "evaluator.ts");
const CODE = readFileSync(SRC, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("⚠ the evaluator derives nothing of its own", () => {
  it("calls the Today screen's own derivation", () => {
    expect(CODE).toMatch(/from\s+"\.\.\/today\/service"/);
    expect(CODE).toMatch(/\breadToday\s*\(/);
    expect(CODE).toMatch(/\bbuildAttention\s*\(/);
  });

  it("⚠ asks for EVERY occurrence, not the card's eight", () => {
    // The card caps at 8; the evaluator must not inherit that cap.
    expect(CODE).toMatch(/buildAttention\([^)]*Number\.POSITIVE_INFINITY/);
  });

  it("⚠ contains no severity, threshold or stock predicate of its own", () => {
    for (const forbidden of [
      /severity/,
      /low_stock_threshold/,
      /stock_on_hand/,
      /daysOfCover/,
      /FROM public\.product\b/,
      /FROM public\."order"/,
    ]) {
      expect(CODE, `evaluator.ts re-derives ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("⚠ reads proposals regardless of role, and filters at the RECIPIENT", () => {
    // Filtering at derivation would lose the occurrence when no manager is online.
    expect(CODE).toMatch(/canRefund:\s*async\s*\(\)\s*=>\s*true/);
    expect(CODE).toMatch(/MANAGER_ONLY_KINDS\.includes\(kind\)\s*&&\s*!r\.isManager/);
  });
});
