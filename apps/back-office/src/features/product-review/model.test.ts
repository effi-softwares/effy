import { describe, expect, it } from "vitest";

import { canDecideReview } from "./access";
import { marginLabel, previewCustomerPrice, toMargin, waitingLabel } from "./model";

describe("previewCustomerPrice", () => {
  it("adds a fixed amount", () => {
    expect(previewCustomerPrice("4.00", "amount", "0.60")).toBe("4.60");
  });
  it("adds a percentage, rounded half-up to the cent like the server's rule", () => {
    expect(previewCustomerPrice("4.00", "percent", "15")).toBe("4.60");
    expect(previewCustomerPrice("3.33", "percent", "15")).toBe("3.83"); // 49.95c → 50c
    expect(previewCustomerPrice("0.99", "percent", "12.5")).toBe("1.11"); // 12.375c → 12c
  });
  it("treats zero as a margin: the customer pays the shop's price", () => {
    expect(previewCustomerPrice("4.00", "percent", "0")).toBe("4.00");
  });
  it("shows nothing rather than a guess while what is typed is not a number", () => {
    for (const v of ["", " ", "abc", "-5", "1e3", "5%"]) {
      expect(previewCustomerPrice("4.00", "percent", v)).toBeNull();
    }
  });
});

describe("toMargin", () => {
  // ⚠ Blank and zero are different answers. Zero is "Effy takes nothing"; blank is "nobody decided".
  it("sends zero, refuses blank", () => {
    expect(toMargin({ kind: "percent", value: "0" })).toEqual({ kind: "percent", value: "0" });
    expect(toMargin({ kind: "percent", value: "" })).toBeNull();
    expect(toMargin({ kind: "amount", value: "-1" })).toBeNull();
  });
});

describe("labels", () => {
  it("says how long an item has waited in the reviewer's units", () => {
    expect(waitingLabel(0)).toBe("Under an hour");
    expect(waitingLabel(5)).toBe("5 h");
    expect(waitingLabel(24)).toBe("1 day");
    expect(waitingLabel(73)).toBe("3 days");
  });
  it("names a missing margin instead of showing zero", () => {
    expect(marginLabel(null)).toBe("Not set");
    expect(marginLabel({ kind: "percent", value: "15" })).toBe("15%");
  });
});

describe("canDecideReview", () => {
  it("is admin and manager — a csa reads the queue and decides nothing", () => {
    expect(canDecideReview(["admin"])).toBe(true);
    expect(canDecideReview(["manager"])).toBe(true);
    expect(canDecideReview(["csa"])).toBe(false);
    expect(canDecideReview([])).toBe(false);
  });
});
