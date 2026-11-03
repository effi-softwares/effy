import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listTeam: vi.fn(),
  isFull: vi.fn(async () => false),
  findByEmail: vi.fn(),
  upsertMember: vi.fn(),
  updateMember: vi.fn(),
}));
vi.mock("./repository", () => repo);

const cognito = vi.hoisted(() => ({
  ensureShopUser: vi.fn(),
  setUserGroups: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
}));
vi.mock("./cognito", () => cognito);

import { invite, updateMember } from "./service";

const SHOP = "shop-1";
const ME = "sub-manager";

function member(over: Record<string, unknown> = {}) {
  return {
    staffId: "st-1",
    email: "maya@effy.shop",
    name: "Maya",
    roles: ["shop_manager"],
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    lastSeenAt: null,
    isSelf: true,
    ...over,
  };
}

function callerIsManager() {
  repo.listTeam.mockResolvedValue([member()]);
}

beforeEach(() => {
  vi.clearAllMocks();
  callerIsManager();
  cognito.ensureShopUser.mockResolvedValue("sub-new");
  repo.updateMember.mockResolvedValue({ email: "them@effy.shop", roleChanged: true, statusChanged: true });
});

/** Decided from the platform record, not `cognito:groups`. */
describe("team management is manager-only, from the record", () => {
  const attempts: [string, () => Promise<unknown>][] = [
    ["invite", () => invite(SHOP, ME, { email: "new@effy.shop", name: "New", role: "shop_staff" })],
    ["rename", () => updateMember(SHOP, ME, "st-2", { name: "New name" })],
    ["changeRole", () => updateMember(SHOP, ME, "st-2", { role: "shop_staff" })],
    ["standDown", () => updateMember(SHOP, ME, "st-2", { status: "disabled" })],
    ["reinstate", () => updateMember(SHOP, ME, "st-2", { status: "active" })],
  ];

  it.each(attempts)("refuses %s for shop_staff", async (_name, run) => {
    repo.listTeam.mockResolvedValue([member({ roles: ["shop_staff"] })]);
    await expect(run()).rejects.toMatchObject({ kind: "forbidden" });
  });

  it.each(attempts)("refuses %s for a stood-down manager", async (_name, run) => {
    repo.listTeam.mockResolvedValue([member({ status: "disabled" })]);
    await expect(run()).rejects.toMatchObject({ kind: "forbidden" });
  });

  it.each(attempts)("refuses %s for someone with no record at this shop", async (_name, run) => {
    repo.listTeam.mockResolvedValue([member({ isSelf: false })]);
    await expect(run()).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("never reaches Cognito when the gate refuses", async () => {
    repo.listTeam.mockResolvedValue([member({ roles: ["shop_staff"] })]);
    await expect(
      invite(SHOP, ME, { email: "new@effy.shop", name: "New", role: "shop_staff" }),
    ).rejects.toThrow();
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });
});

/** A reused email is refused before provisioning, so a departed colleague's sign-in never comes back. */
describe("inviting a reused email refuses instead of resurrecting an account", () => {
  it("refuses a stood-down colleague and says how to bring them back deliberately", async () => {
    repo.findByEmail.mockResolvedValue({ staffId: "st-9", status: "disabled", sameShop: true });

    await expect(
      invite(SHOP, ME, { email: "gone@effy.shop", name: "Gone", role: "shop_staff" }),
    ).rejects.toMatchObject({ kind: "conflict" });

    // Cognito is never touched.
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
    expect(repo.upsertMember).not.toHaveBeenCalled();
  });

  it("refuses an email already active on the team", async () => {
    repo.findByEmail.mockResolvedValue({ staffId: "st-2", status: "active", sameShop: true });
    await expect(
      invite(SHOP, ME, { email: "here@effy.shop", name: "Here", role: "shop_staff" }),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });

  /** Never "they work at another shop". */
  it("refuses an email belonging to another shop without disclosing where", async () => {
    repo.findByEmail.mockResolvedValue({ staffId: "st-3", status: "active", sameShop: false });
    await expect(
      invite(SHOP, ME, { email: "other@effy.shop", name: "Other", role: "shop_staff" }),
    ).rejects.toMatchObject({ kind: "conflict", message: expect.not.stringContaining("shop") });
  });

  it("provisions a genuinely new colleague", async () => {
    repo.findByEmail.mockResolvedValue(null);
    await invite(SHOP, ME, { email: "  New@Effy.Shop ", name: " New Person ", role: "shop_staff" });

    // Differs only in case: the same person.
    expect(cognito.ensureShopUser).toHaveBeenCalledWith("new@effy.shop", "New Person", "shop_staff");
    expect(repo.upsertMember).toHaveBeenCalledWith(SHOP, "sub-new", "new@effy.shop", "New Person", "shop_staff");
  });

  it("refuses an unusable email or role before doing anything", async () => {
    repo.findByEmail.mockResolvedValue(null);
    for (const body of [
      { email: "not-an-email", name: "X", role: "shop_staff" },
      { email: "a@b.co", name: "", role: "shop_staff" },
      { email: "a@b.co", name: "X", role: "admin" },
    ]) {
      await expect(invite(SHOP, ME, body)).rejects.toBeInstanceOf(Error);
    }
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });
});

/** Editing a colleague: the record is written once, then Cognito mirrors what actually changed. */
describe("editing a colleague", () => {
  it("renames without touching Cognito", async () => {
    repo.updateMember.mockResolvedValue({ email: "them@effy.shop", roleChanged: false, statusChanged: false });
    await updateMember(SHOP, ME, "st-2", { name: "  Sam Perera  " });
    expect(repo.updateMember).toHaveBeenCalledWith(SHOP, "st-2", ME, { name: "Sam Perera" });
    expect(cognito.setUserGroups).not.toHaveBeenCalled();
    expect(cognito.disableUser).not.toHaveBeenCalled();
    expect(cognito.enableUser).not.toHaveBeenCalled();
  });

  it("replaces the Cognito groups on a role change, or the next sign-in reinstates the old group", async () => {
    repo.updateMember.mockResolvedValue({ email: "them@effy.shop", roleChanged: true, statusChanged: false });
    await updateMember(SHOP, ME, "st-2", { role: "shop_staff" });
    expect(cognito.setUserGroups).toHaveBeenCalledWith("them@effy.shop", ["shop_staff"]);
  });

  it("leaves Cognito alone when the role is unchanged", async () => {
    repo.updateMember.mockResolvedValue({ email: "them@effy.shop", roleChanged: false, statusChanged: false });
    await updateMember(SHOP, ME, "st-2", { name: "Sam", role: "shop_staff" });
    expect(cognito.setUserGroups).not.toHaveBeenCalled();
  });

  it("disables the sign-in on stand-down and enables it on reinstatement", async () => {
    repo.updateMember.mockResolvedValue({ email: "them@effy.shop", roleChanged: false, statusChanged: true });
    await updateMember(SHOP, ME, "st-2", { status: "disabled" });
    expect(cognito.disableUser).toHaveBeenCalledWith("them@effy.shop");

    await updateMember(SHOP, ME, "st-2", { status: "active" });
    expect(cognito.enableUser).toHaveBeenCalledWith("them@effy.shop");
  });

  it("never reaches Cognito when the record refuses (last manager, self stand-down)", async () => {
    const { ProductError } = await import("../products/types");
    repo.updateMember.mockRejectedValue(new ProductError("conflict", "this shop would be left with no manager"));
    await expect(updateMember(SHOP, ME, "st-1", { status: "disabled" })).rejects.toMatchObject({ kind: "conflict" });
    expect(cognito.disableUser).not.toHaveBeenCalled();
    expect(cognito.setUserGroups).not.toHaveBeenCalled();
  });

  it("refuses an empty edit, a blank or overlong name, an unknown role or status — before any write", async () => {
    for (const body of [
      {},
      { name: "   " },
      { name: "x".repeat(121) },
      { role: "admin" },
      { status: "deleted" },
      { email: "new@effy.shop" },
    ]) {
      await expect(updateMember(SHOP, ME, "st-2", body)).rejects.toMatchObject({ kind: "validation" });
    }
    expect(repo.updateMember).not.toHaveBeenCalled();
  });
});

describe("103 — a shop's team is capped", () => {
  it("refuses a new colleague once the team is full, before any sign-in is made", async () => {
    repo.isFull.mockResolvedValueOnce(true);
    await expect(invite(SHOP, ME, { email: "new@effy.shop", name: "New", role: "shop_staff" })).rejects.toMatchObject({
      kind: "conflict",
      message: "This list is full (500). Remove one before adding another.",
    });
    expect(cognito.ensureShopUser).not.toHaveBeenCalled();
  });
});
