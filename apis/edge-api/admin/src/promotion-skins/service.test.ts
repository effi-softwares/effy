import { beforeEach, describe, expect, it, vi } from "vitest";

import { starterSettings, type AdminSkinDTO } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  listSkins: vi.fn(),
  isFull: vi.fn(async () => false),
  readSkin: vi.fn(),
  insertSkin: vi.fn(),
  updateSkin: vi.fn(),
  deleteSkin: vi.fn(),
  sizesUsing: vi.fn(),
}));
vi.mock("./repository", () => repo);
vi.mock("@effy/edge-shared/live", () => ({ announce: vi.fn() }));
vi.mock("@effy/edge-shared", () => ({
  emitMetric: vi.fn(),
  metricNamespace: () => "test",
  LIMIT_REACHED: "limit_reached",
  SET_FULL_SENTENCE: "This list is full (500). Remove one before adding another.",
}));

const { createSkin, deleteSkin, duplicateSkin, updateSkin } = await import("./service");

const ID = "11111111-1111-4111-8111-111111111111";
const skin = (over: Partial<AdminSkinDTO> = {}): AdminSkinDTO => ({
  id: ID, name: "Panel", layout: "panel", version: 3, builtIn: false, usageCount: 0, settings: starterSettings("panel"),
  updatedAt: "", usage: { placements: 0, groups: [], defaultOf: [] }, createdBy: "s", updatedBy: null, createdAt: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.readSkin.mockResolvedValue(skin());
  repo.insertSkin.mockResolvedValue(ID);
});

describe("095 — skins are saved only when valid and readable", () => {
  it("creates a readable skin, colours lower-cased", async () => {
    await createSkin({ name: " Winter ", layout: "panel", settings: { ...starterSettings("panel"), background: { colour: "#1D4ED8", picture: "none" } } }, "staff");
    expect(repo.insertSkin).toHaveBeenCalledWith(expect.objectContaining({ name: "Winter", layout: "panel", settings: expect.objectContaining({ background: { colour: "#1d4ed8", picture: "none" } }) }), "staff");
  });

  it("⚠ refuses an unreadable skin, naming each pair", async () => {
    const yellow = { ...starterSettings("panel"), background: { colour: "#facc15", picture: "none" } };
    await expect(createSkin({ name: "Sunny", layout: "panel", settings: yellow }, "staff")).rejects.toMatchObject({
      status: 422,
      code: "skin_unreadable",
      fields: expect.arrayContaining([expect.objectContaining({ field: "headline/background" })]),
    });
    expect(repo.insertSkin).not.toHaveBeenCalled();
  });

  it("refuses a malformed skin and an unknown layout", async () => {
    await expect(createSkin({ name: "x", layout: "canvas", settings: {} }, "s")).rejects.toMatchObject({ status: 422 });
    await expect(createSkin({ name: "x", layout: "panel", settings: { ...starterSettings("panel"), sparkle: 1 } }, "s")).rejects.toMatchObject({ code: "invalid_skin" });
  });

  it("an edit from an older version is refused (FR-014)", async () => {
    repo.updateSkin.mockResolvedValue("stale");
    await expect(updateSkin(ID, { expectedVersion: 2, name: "New" }, "s")).rejects.toMatchObject({ status: 409, code: "skin_changed" });
  });

  it("a layout change that no longer fits where the skin is used is refused", async () => {
    repo.sizesUsing.mockResolvedValue(["large"]);
    repo.updateSkin.mockImplementation(async (_id, _c, _v, _a, check) => {
      await check({}, { layout: "panel", version: 3 });
      return "updated";
    });
    await expect(updateSkin(ID, { expectedVersion: 3, layout: "tile", settings: starterSettings("tile") }, "s")).rejects.toMatchObject({ code: "skin_does_not_fit" });
  });

  it("Classic cannot be changed, duplicated or removed", async () => {
    repo.readSkin.mockResolvedValue(skin({ layout: "classic", builtIn: true, settings: undefined }));
    await expect(updateSkin(ID, { expectedVersion: 1, name: "x" }, "s")).rejects.toMatchObject({ code: "skin_built_in" });
    await expect(duplicateSkin(ID, { name: "x" }, "s")).rejects.toMatchObject({ code: "skin_built_in" });
    await expect(deleteSkin(ID, "s")).rejects.toMatchObject({ code: "skin_built_in" });
  });

  it("a skin in use is not removed, and the refusal says where (FR-013)", async () => {
    repo.deleteSkin.mockResolvedValue({ placements: 1, groups: [{ id: "g", key: "home-hero", name: "Home hero", members: 1 }], defaultOf: [{ id: "g2", key: "offers", name: "Offers page", forCode: false }] });
    await expect(deleteSkin(ID, "s")).rejects.toMatchObject({ status: 409, code: "skin_in_use", message: expect.stringContaining("Home hero, Offers page (default)") });
  });

  it("duplicating copies every setting under the new name", async () => {
    await duplicateSkin(ID, { name: "Panel copy" }, "s");
    expect(repo.insertSkin).toHaveBeenCalledWith({ name: "Panel copy", layout: "panel", settings: starterSettings("panel") }, "s", "promotion_skin.duplicated", { from: ID });
  });
});

describe("103 — the set of skins is capped", () => {
  it("refuses a new skin once the set is full, and writes nothing", async () => {
    repo.isFull.mockResolvedValueOnce(true);
    await expect(createSkin({ name: "One more", layout: "panel", settings: starterSettings("panel") }, "s")).rejects.toMatchObject({
      status: 409,
      code: "limit_reached",
    });
    expect(repo.insertSkin).not.toHaveBeenCalled();
  });
});
