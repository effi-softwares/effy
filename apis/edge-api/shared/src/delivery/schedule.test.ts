import { describe, expect, it } from "vitest";

import { melbourneDate } from "./schedule";

describe("melbourneDate", () => {
  it("23:30 UTC on the 23rd is already the 24th in Melbourne", () => {
    expect(melbourneDate(new Date(Date.UTC(2026, 7, 23, 23, 30)))).toBe("2026-08-24");
  });
});
