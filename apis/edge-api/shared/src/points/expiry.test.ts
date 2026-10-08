import { describe, expect, it } from "vitest";

import { expiresAtFor, lastUsableDate, lastUsableDateOf } from "./expiry";

describe("074 — when points expire (R2)", () => {
  it("is usable through the same date the period later, stopping at Melbourne midnight", () => {
    // 10:42 AEDT on 8 Oct 2026.
    const credited = new Date("2026-10-07T23:42:00Z");
    expect(lastUsableDate(credited, 12)).toBe("2027-10-08");
    // 9 Oct 2027 00:00 in Melbourne is 13:00 UTC on 8 Oct (AEDT, +11).
    expect(expiresAtFor(credited, 12).toISOString()).toBe("2027-10-08T13:00:00.000Z");
    expect(lastUsableDateOf(expiresAtFor(credited, 12))).toBe("2027-10-08");
  });

  it("uses the MELBOURNE date of the credit, not the UTC one", () => {
    // 23:30 UTC on 31 Dec 2026 is already 1 Jan 2027 in Melbourne.
    expect(lastUsableDate(new Date("2026-12-31T23:30:00Z"), 1)).toBe("2027-02-01");
  });

  it("lands on the last day of a shorter month instead of spilling over", () => {
    expect(lastUsableDate(new Date("2027-01-31T02:00:00Z"), 1)).toBe("2027-02-28");
    expect(lastUsableDate(new Date("2028-01-31T02:00:00Z"), 1)).toBe("2028-02-29");
    expect(lastUsableDate(new Date("2028-02-29T02:00:00Z"), 12)).toBe("2029-02-28");
  });

  it("crosses year ends", () => {
    expect(lastUsableDate(new Date("2026-11-15T02:00:00Z"), 3)).toBe("2027-02-15");
    expect(lastUsableDate(new Date("2026-11-15T02:00:00Z"), 120)).toBe("2036-11-15");
  });

  it("is a real Melbourne midnight on both DST change days", () => {
    // Clocks go forward on Sun 4 Oct 2026 (02:00 → 03:00): expiring after 3 Oct 2026 → midnight is still AEST (+10).
    expect(expiresAtFor(new Date("2026-09-03T02:00:00Z"), 1).toISOString()).toBe("2026-10-03T14:00:00.000Z");
    // Midnight starting 4 Oct is AEST; midnight starting 5 Oct is AEDT (+11).
    expect(expiresAtFor(new Date("2026-09-04T02:00:00Z"), 1).toISOString()).toBe("2026-10-04T13:00:00.000Z");
    // Clocks go back on Sun 5 Apr 2026: midnight starting 6 Apr is AEST (+10).
    expect(expiresAtFor(new Date("2026-03-05T02:00:00Z"), 1).toISOString()).toBe("2026-04-05T14:00:00.000Z");
  });
});
