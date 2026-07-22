import { describe, expect, it } from "vitest";

import { canManageDelivery } from "./access";

// The interface-layer capability gate (least-privilege UX). admin/manager may mutate the delivery
// map; csa and role-less accounts see it read-only. The backend independently enforces the same rule.
describe("canManageDelivery", () => {
  it("is true when admin or manager is present", () => {
    expect(canManageDelivery(["admin"])).toBe(true);
    expect(canManageDelivery(["manager"])).toBe(true);
    expect(canManageDelivery(["csa", "manager"])).toBe(true);
  });

  it("is false for csa or role-less accounts", () => {
    expect(canManageDelivery(["csa"])).toBe(false);
    expect(canManageDelivery([])).toBe(false);
  });
});
