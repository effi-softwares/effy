import { describe, expect, it } from "vitest";

import { isAdmin } from "./model";

describe("isAdmin (role-aware nav)", () => {
  it("is true when the admin role is present", () => {
    expect(isAdmin(["admin"])).toBe(true);
    expect(isAdmin(["manager", "admin"])).toBe(true);
  });

  it("is false for non-admin or role-less accounts", () => {
    expect(isAdmin(["manager"])).toBe(false);
    expect(isAdmin(["csa"])).toBe(false);
    expect(isAdmin([])).toBe(false);
  });
});
