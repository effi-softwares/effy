import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  shopExistsByCode: vi.fn(),
  shopIdForEmail: vi.fn(),
  createShopWithManager: vi.fn(),
  addShopUser: vi.fn(),
  getShopUserForUpdate: vi.fn(),
  setShopUserRole: vi.fn(),
  setShopUserStatus: vi.fn(),
  deleteShop: vi.fn(),
  shopStatus: vi.fn(),
  changeShopStatus: vi.fn(),
  getShopDetail: vi.fn(),
}));
const cognito = vi.hoisted(() => ({
  ensureShopUser: vi.fn(),
  setUserGroups: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
}));
vi.mock("./repository", () => repo);
vi.mock("./cognito", () => cognito);

import { addShopUser, changeShopStatus, createShop, updateShopUser } from "./service";
import { isShopError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isShopError(e) ? e.kind : "other";
  }
}

const validCreate = {
  code: "CMB-01",
  name: "Colombo 01",
  primaryContact: { name: "Sam", email: "sam@effy.test" },
};

describe("createShop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a duplicate code before any write (no Cognito call)", async () => {
    repo.shopExistsByCode.mockResolvedValue(true);
    expect(await kindOf(createShop(validCreate, "actor"))).toBe("conflict");
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
    expect(repo.createShopWithManager).not.toHaveBeenCalled();
  });

  it("refuses an email already bound to a shop (one-user-one-shop, FR-009)", async () => {
    repo.shopExistsByCode.mockResolvedValue(false);
    repo.shopIdForEmail.mockResolvedValue("shop-x");
    expect(await kindOf(createShop(validCreate, "actor"))).toBe("conflict");
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });

  it("rejects invalid input with a validation error and no side effects", async () => {
    expect(await kindOf(createShop({ code: "", name: "" }, "actor"))).toBe("validation");
    expect(repo.shopExistsByCode).not.toHaveBeenCalled();
  });

  it("provisions Cognito FIRST, then writes the DB record (R4 ordering)", async () => {
    repo.shopExistsByCode.mockResolvedValue(false);
    repo.shopIdForEmail.mockResolvedValue(null);
    cognito.ensureShopUser.mockResolvedValue("sub-1");
    repo.createShopWithManager.mockResolvedValue({ id: "shop-1" });

    await createShop(validCreate, "actor");

    expect(cognito.ensureShopUser).toHaveBeenCalledWith("sam@effy.test", "Sam", "shop_manager");
    expect(repo.createShopWithManager).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CMB-01", primary: { sub: "sub-1", email: "sam@effy.test", name: "Sam" } }),
      "actor",
    );
    expect(cognito.ensureShopUser.mock.invocationCallOrder[0]!).toBeLessThan(
      repo.createShopWithManager.mock.invocationCallOrder[0]!,
    );
  });
});

describe("addShopUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an email already bound to a shop", async () => {
    repo.shopIdForEmail.mockResolvedValue("shop-y");
    const p = addShopUser("shop-1", { name: "Al", email: "al@effy.test", role: "shop_staff" }, "actor");
    expect(await kindOf(p)).toBe("conflict");
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });
});

describe("updateShopUser (identity ↔ record consistency, R5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getShopUserForUpdate.mockResolvedValue({
      id: "u1",
      email: "al@effy.test",
      shopId: "shop-1",
      roles: ["shop_staff"],
    });
    repo.setShopUserRole.mockResolvedValue({ id: "u1" });
    repo.setShopUserStatus.mockResolvedValue({ id: "u1" });
  });

  it("role change touches BOTH Cognito groups and the DB record", async () => {
    await updateShopUser("shop-1", "u1", { role: "shop_manager" }, "actor");
    expect(cognito.setUserGroups).toHaveBeenCalledWith("al@effy.test", ["shop_manager"]);
    expect(repo.setShopUserRole).toHaveBeenCalledWith("u1", "shop_manager", "actor");
  });

  it("disabling a user disables the Cognito account AND sets platform status (Q1)", async () => {
    await updateShopUser("shop-1", "u1", { status: "disabled" }, "actor");
    expect(cognito.disableUser).toHaveBeenCalledWith("al@effy.test");
    expect(repo.setShopUserStatus).toHaveBeenCalledWith("u1", "disabled", "actor");
  });

  it("re-enabling enables the account", async () => {
    await updateShopUser("shop-1", "u1", { status: "active" }, "actor");
    expect(cognito.enableUser).toHaveBeenCalledWith("al@effy.test");
  });
});

describe("changeShopStatus (transition validity)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a no-op transition (same status) with conflict", async () => {
    repo.shopStatus.mockResolvedValue("active");
    expect(await kindOf(changeShopStatus("shop-1", "active", "actor"))).toBe("conflict");
  });

  it("404s an unknown shop", async () => {
    repo.shopStatus.mockResolvedValue(null);
    expect(await kindOf(changeShopStatus("shop-1", "suspended", "actor"))).toBe("not_found");
  });

  it("rejects an invalid status value", async () => {
    expect(await kindOf(changeShopStatus("shop-1", "banished", "actor"))).toBe("validation");
  });

  it("applies a valid transition with from/to", async () => {
    repo.shopStatus.mockResolvedValue("active");
    repo.changeShopStatus.mockResolvedValue({ id: "shop-1" });
    await changeShopStatus("shop-1", "suspended", "actor");
    expect(repo.changeShopStatus).toHaveBeenCalledWith("shop-1", "active", "suspended", "actor");
  });
});
