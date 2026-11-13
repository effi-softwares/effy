import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const readMemberBySub = vi.hoisted(() => vi.fn());
const touchLastSeen = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
}));
vi.mock("@effy/edge-shared/team", () => ({ readMemberBySub, touchLastSeen }));

import { authorizeAdmin } from "./repository";
import { loadAndTouch } from "./service";

describe("authorizeAdmin (platform record: status active AND role admin)", () => {
  beforeEach(() => query.mockReset());

  it("is true when the record says active admin", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await authorizeAdmin("sub-1")).toBe(true);
  });

  it("is false for a disabled or non-admin or absent record", async () => {
    query.mockResolvedValue({ rows: [{ ok: false }] });
    expect(await authorizeAdmin("sub-1")).toBe(false);
    query.mockResolvedValue({ rows: [] });
    expect(await authorizeAdmin("sub-1")).toBe(false);
  });
});

describe("loadAndTouch (119 R1: a sign-in never writes the team)", () => {
  beforeEach(() => {
    readMemberBySub.mockReset();
    touchLastSeen.mockReset();
  });

  it("no record → not_on_team, and nothing is written", async () => {
    readMemberBySub.mockResolvedValue(null);
    expect(await loadAndTouch("sub-x")).toEqual({ ok: false, refusal: "not_on_team" });
    expect(touchLastSeen).not.toHaveBeenCalled();
  });

  it.each(["disabled", "removed"])("%s → staff_disabled, not marked seen", async (status) => {
    readMemberBySub.mockResolvedValue({ subject: "sub-1", status, role: "csa" });
    expect(await loadAndTouch("sub-1")).toEqual({ ok: false, refusal: "staff_disabled" });
    expect(touchLastSeen).not.toHaveBeenCalled();
  });

  it("active → the record, marked seen", async () => {
    readMemberBySub.mockResolvedValue({ subject: "sub-1", status: "active", role: "csa", lastSeenAt: null });
    const out = await loadAndTouch("sub-1");
    expect(out).toMatchObject({ ok: true, member: { subject: "sub-1", role: "csa" } });
    expect(touchLastSeen).toHaveBeenCalledTimes(1);
  });
});
