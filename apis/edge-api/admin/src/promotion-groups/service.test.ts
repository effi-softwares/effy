import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listGroups: vi.fn(),
  isFull: vi.fn(async () => false),
  readGroup: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  putMembers: vi.fn(),
  previewGroup: vi.fn(),
}));
vi.mock("./repository", () => repo);
vi.mock("@effy/edge-shared/live", () => ({ announce: vi.fn() }));

const { createGroup, putMembers, updateGroup } = await import("./service");

const G = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  repo.readGroup.mockResolvedValue({ id: G, members: [] });
  repo.updateGroup.mockResolvedValue({ reset: [] });
});

describe("095 — groups carry a size and skins", () => {
  it("a new group is medium unless told; an unknown size is refused", async () => {
    repo.createGroup.mockResolvedValue({ id: G });
    await createGroup({ key: "summer", name: "Summer" }, "s");
    expect(repo.createGroup).toHaveBeenCalledWith(expect.objectContaining({ size: "medium" }), "s");
    await expect(createGroup({ key: "x", name: "X", size: "huge" }, "s")).rejects.toMatchObject({ status: 422 });
  });

  it("size and default skins are passed on, and the members reset by a size change are answered", async () => {
    repo.updateGroup.mockResolvedValue({ reset: [P1] });
    const out = await updateGroup(G, { size: "small", defaultSkinId: S, defaultCodeSkinId: null }, "s");
    expect(repo.updateGroup).toHaveBeenCalledWith(G, { size: "small", defaultSkinId: S, defaultCodeSkinId: null }, "s");
    expect(out.reset).toEqual([P1]);
    await expect(updateGroup(G, { defaultSkinId: "panel" }, "s")).rejects.toMatchObject({ status: 422 });
  });

  it("members carry their skin and picture, in order", async () => {
    await putMembers(G, { members: [{ promotionId: P1, skinId: S, imageId: null }, { promotionId: P2 }] }, "s");
    expect(repo.putMembers).toHaveBeenCalledWith(G, [{ promotionId: P1, skinId: S, imageId: null }, { promotionId: P2, skinId: null, imageId: null }], "s");
  });

  it("refuses a body without members", async () => {
    await expect(putMembers(G, { promotionIds: [P2, P1] }, "s")).rejects.toMatchObject({ status: 422 });
  });

  it("refuses a promotion twice or a malformed skin id", async () => {
    await expect(putMembers(G, { members: [{ promotionId: P1 }, { promotionId: P1 }] }, "s")).rejects.toMatchObject({ status: 422 });
    await expect(putMembers(G, { members: [{ promotionId: P1, skinId: "x" }] }, "s")).rejects.toMatchObject({ status: 422 });
  });
});

describe("103 — the set of groups is capped", () => {
  it("refuses a new group once the set is full, with the one sentence, and writes nothing", async () => {
    repo.isFull.mockResolvedValueOnce(true);
    await expect(createGroup({ key: "one-more", name: "One more" }, "s")).rejects.toMatchObject({
      status: 409,
      code: "limit_reached",
      message: "This list is full (500). Remove one before adding another.",
    });
    expect(repo.createGroup).not.toHaveBeenCalled();
  });
});
