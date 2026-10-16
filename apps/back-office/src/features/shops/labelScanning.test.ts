import { describe, expect, it } from "vitest";

import { labelScanningText } from "./ShopDetailScreen";

describe("091 — label scanning on the shop page", () => {
  it("states scanned, not scanned and the share", () => {
    expect(labelScanningText({ scanned: 8, notScanned: 2, sinceDays: 30 })).toBe("8 scanned · 2 not scanned (20%) · last 30 days");
  });
  it("says so when nothing was recorded", () => {
    expect(labelScanningText({ scanned: 0, notScanned: 0, sinceDays: 30 })).toBe("No scanning recorded in the last 30 days");
  });
});
