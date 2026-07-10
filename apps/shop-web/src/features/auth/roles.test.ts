import { isShopManager, toShopRoles } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

describe("shop roles", () => {
  it("recognises a shop manager", () => {
    expect(isShopManager(["shop_manager"])).toBe(true);
    expect(isShopManager(["shop_staff", "shop_manager"])).toBe(true);
  });

  it("does not promote a shop_staff or role-less operator", () => {
    expect(isShopManager(["shop_staff"])).toBe(false);
    expect(isShopManager([])).toBe(false);
  });

  // Tolerant reader (versioning-policy rule 4): a role the backend adds later must map to nothing
  // here rather than throwing, so an old client keeps working against a newer server.
  it("drops unknown group names instead of throwing", () => {
    expect(toShopRoles(["shop_manager", "admin", "picker"])).toEqual(["shop_manager"]);
    expect(toShopRoles(undefined)).toEqual([]);
  });

  // Cross-pool hygiene: a back-office group name must never become a shop role.
  it("never narrows a back-office group into a shop role", () => {
    expect(toShopRoles(["admin", "manager", "csa"])).toEqual([]);
  });
});
