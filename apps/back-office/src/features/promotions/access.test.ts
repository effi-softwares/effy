import { describe, expect, it } from "vitest";

import { canManagePromotions } from "./access";

describe("canManagePromotions", () => {
  it("lets admin and manager mutate", () => {
    expect(canManagePromotions(["admin"])).toBe(true);
    expect(canManagePromotions(["manager"])).toBe(true);
  });

  it("gives csa and a role-less account read-only access", () => {
    // Support can answer "is this code still live?"; changing what it is worth is not their call.
    expect(canManagePromotions(["csa"])).toBe(false);
    expect(canManagePromotions([])).toBe(false);
  });
});
