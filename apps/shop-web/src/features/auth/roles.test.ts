import { isStoreManager, toStoreRoles } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

describe("store roles", () => {
  it("recognises a store manager", () => {
    expect(isStoreManager(["store_manager"])).toBe(true);
    expect(isStoreManager(["store_staff", "store_manager"])).toBe(true);
  });

  it("does not promote a store_staff or role-less operator", () => {
    expect(isStoreManager(["store_staff"])).toBe(false);
    expect(isStoreManager([])).toBe(false);
  });

  // Tolerant reader (versioning-policy rule 4): a role the backend adds later must map to nothing
  // here rather than throwing, so an old client keeps working against a newer server.
  it("drops unknown group names instead of throwing", () => {
    expect(toStoreRoles(["store_manager", "admin", "picker"])).toEqual(["store_manager"]);
    expect(toStoreRoles(undefined)).toEqual([]);
  });

  // Cross-pool hygiene: a back-office group name must never become a store role.
  it("never narrows a back-office group into a store role", () => {
    expect(toStoreRoles(["admin", "manager", "csa"])).toEqual([]);
  });
});
