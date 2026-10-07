import { describe, expect, it } from "vitest";

import { leastAdvanced, PACKAGE_STATUSES, STATUS_TONE, STATUS_WORD, type PackageStatusView } from "./package-status";

const v = (status: PackageStatusView["status"]): PackageStatusView => ({ status, word: STATUS_WORD[status], detail: null, driverName: null });

describe("package status words (073)", () => {
  it("has a word and a tone for every status", () => {
    for (const s of PACKAGE_STATUSES) {
      expect(STATUS_WORD[s]).toBeTruthy();
      expect(STATUS_TONE[s]).toBeTruthy();
    }
  });

  it("an order is as far along as its least advanced package", () => {
    expect(leastAdvanced([v("delivered"), v("with_driver")])!.status).toBe("with_driver");
  });

  it("a problem anywhere is what the order row shows", () => {
    expect(leastAdvanced([v("delivered"), v("problem"), v("preparing")])!.status).toBe("problem");
  });

  it("a cancelled package does not hold the order back", () => {
    expect(leastAdvanced([v("cancelled"), v("delivered")])!.status).toBe("delivered");
    expect(leastAdvanced([v("cancelled")])!.status).toBe("cancelled");
    expect(leastAdvanced([])).toBeNull();
  });
});
