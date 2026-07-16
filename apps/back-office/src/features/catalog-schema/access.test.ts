import { describe, expect, it } from "vitest";

import { canManageCatalog } from "./access";

// The interface-layer capability gate (least-privilege UX). admin/manager may mutate the schema;
// csa and role-less accounts see it read-only. The backend independently enforces the same rule.
describe("canManageCatalog", () => {
  it("is true when admin or manager is present", () => {
    expect(canManageCatalog(["admin"])).toBe(true);
    expect(canManageCatalog(["manager"])).toBe(true);
    expect(canManageCatalog(["csa", "manager"])).toBe(true);
  });

  it("is false for csa or role-less accounts", () => {
    expect(canManageCatalog(["csa"])).toBe(false);
    expect(canManageCatalog([])).toBe(false);
  });
});
