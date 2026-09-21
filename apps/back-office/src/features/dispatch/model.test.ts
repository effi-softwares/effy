import { describe, expect, it } from "vitest";

import type { ExclusionReasonDTO } from "@effy/shared-types";

import { describeReasons, REASON_TEXT } from "./model";

describe("describeReasons", () => {
  it("has a sentence for every reason the contract can produce", () => {
    // ⚠ EXHAUSTIVE OVER THE CONTRACT, not over a list somebody maintains. 053, 056 and 057 each
    // shipped a defect through an enum widening; a new reason with no wording would render as
    // `undefined` on the one screen that exists to explain things.
    const all: ExclusionReasonDTO[] = [
      "not_on_duty",
      "not_employable",
      "licence_expired",
      "no_vehicle",
      "not_cleared",
      "no_refrigeration",
      "over_capacity",
      "cannot_meet_deadline",
    ];
    for (const r of all) {
      expect(REASON_TEXT[r], `${r} has no wording`).toBeTruthy();
      expect(REASON_TEXT[r]).not.toMatch(/_/); // never the raw enum
    }
    expect(Object.keys(REASON_TEXT).sort()).toEqual([...all].sort());
  });

  it("joins several reasons readably", () => {
    expect(describeReasons(["licence_expired", "no_vehicle"])).toBe(
      "Licence expired · Holding no vehicle",
    );
  });

  it("says something different when there was no candidate at all", () => {
    expect(describeReasons([])).toBe("No driver is cleared for this work at all");
  });
});
