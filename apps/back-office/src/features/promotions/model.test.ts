import { describe, expect, it } from "vitest";

import { isValueEditable, promoValueLabel, redemptionLabel, type PromoCode } from "./model";

const BASE: PromoCode = {
  id: "p1",
  code: "SPRING20",
  kind: "percentage",
  percentOff: 20,
  amountOff: null,
  currency: "AUD",
  minimumSubtotalAmount: "0.00",
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxPerCustomer: null,
  status: "active",
  redemptionCount: 0,
  createdBy: "actor",
  updatedBy: null,
  createdAt: "2026-07-01T00:00:00Z",
  isAdvertised: false,
  bannerTitle: null,
  bannerSubtitle: null,
  bannerImageKey: null,
  bannerPosition: 0,
  updatedAt: "2026-07-01T00:00:00Z",
};

describe("isValueEditable", () => {
  it("is true only while the code has never been redeemed (FR-068)", () => {
    expect(isValueEditable(BASE)).toBe(true);
    expect(isValueEditable({ ...BASE, redemptionCount: 1 })).toBe(false);
  });
});

describe("promoValueLabel", () => {
  it("reads a percentage code", () => {
    expect(promoValueLabel(BASE)).toBe("20% off");
  });

  it("reads a fixed code with its currency symbol", () => {
    expect(promoValueLabel({ ...BASE, kind: "fixed", percentOff: null, amountOff: "10.00" })).toBe("$10.00 off");
  });
});

describe("redemptionLabel", () => {
  it("shows usage against a cap when one exists", () => {
    expect(redemptionLabel({ ...BASE, redemptionCount: 3, maxRedemptions: 500 })).toBe("3 of 500");
  });

  it("shows a bare count when uncapped — 'of ∞' would read as a broken number", () => {
    expect(redemptionLabel({ ...BASE, redemptionCount: 3 })).toBe("3 used");
  });
});
