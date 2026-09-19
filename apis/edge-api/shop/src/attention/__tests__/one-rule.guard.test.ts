import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ A10 — ONE DERIVATION, TWO CALLERS (Principle II).
 *
 * The evaluator must decide what needs attention by calling the SAME functions the Today screen
 * calls. If the two ever derived separately, an operator would be notified about something the
 * console does not list — or, worse, not notified about something it does. That is 054's
 * `availability`-in-14-places defect and 058's FR-006 restated for a second reader.
 *
 * ⚠ THE EXISTING "TODAY TESTS PASS UNMODIFIED" PROOF DOES NOT COVER THIS. Those tests prove the
 * screen still works; they say nothing about whether a second implementation grew up beside it.
 * Nothing else in this repository would notice.
 */
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
    // The card caps at 8. Inheriting that cap would mean a shop with forty products below threshold
    // records only eight, and the other thirty-two are announced one at a time as the earlier ones
    // clear — for weeks. This is the one thing the shared function's cap parameter buys.
    expect(CODE).toMatch(/buildAttention\([^)]*Number\.POSITIVE_INFINITY/);
  });

  it("⚠ contains no severity, threshold or stock predicate of its own", () => {
    // A second implementation of "what counts as low" is how the screen and the notification start
    // disagreeing, silently and in the operator's favour exactly never.
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
    // FR-022. Filtering at derivation would lose the occurrence entirely when no manager is online,
    // and then announce it as brand new the moment one signs in.
    expect(CODE).toMatch(/canRefund:\s*async\s*\(\)\s*=>\s*true/);
    expect(CODE).toMatch(/MANAGER_ONLY_KINDS\.includes\(kind\)\s*&&\s*!r\.isManager/);
  });
});
