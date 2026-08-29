import { beforeEach, describe, expect, it, vi } from "vitest";

const isActiveStaff = vi.hoisted(() => vi.fn());
const hasStaffRole = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const preamble = vi.hoisted(() => vi.fn(() => ({ log: { error: vi.fn() }, requestId: "r" })));
const subject = vi.hoisted(() => vi.fn(() => "staff-sub"));
const problem = vi.hoisted(() =>
  vi.fn((status: number, _t: string, title: string, detail: string) => ({
    statusCode: status,
    body: JSON.stringify({ title, detail }),
  })),
);

vi.mock("@effy/edge-shared", () => ({
  isActiveStaff,
  hasStaffRole,
  query,
  preamble,
  subject,
  problem,
  ProblemType: { Unauthenticated: "u", Forbidden: "f", ValidationFailed: "v", Conflict: "c" },
  OUTWARD_ACTION_ROLES: ["admin", "manager"],
  unavailable: vi.fn(() => ({ statusCode: 503 })),
}));

const { backOfficeGate } = await import("./handler-support");

const event = { pathParameters: { shopId: "shop-1" } } as never;
const ctx = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  subject.mockReturnValue("staff-sub");
  query.mockResolvedValue({ rows: [{ ok: true }] });
});

describe("the back-office tier split (054 FR-025, FR-028)", () => {
  it("lets ANY active staff READ — including csa, because triage is CSA work", async () => {
    isActiveStaff.mockResolvedValue(true);
    const g = await backOfficeGate(event, ctx, "read");

    expect(g.ok).toBe(true);
    // ⚠ The read gate must NOT consult roles. Until this feature, a support agent could not see a
    // single order they were being asked about — 053 fixed that for orders and named the reason;
    // the same reasoning applies to the number a shop rings up about.
    expect(hasStaffRole).not.toHaveBeenCalled();
  });

  it("restricts WRITING to admin/manager", async () => {
    hasStaffRole.mockResolvedValue(true);
    const g = await backOfficeGate(event, ctx, "write");

    expect(g.ok).toBe(true);
    expect(hasStaffRole).toHaveBeenCalledWith("staff-sub", ["admin", "manager"]);
  });

  it("refuses a csa WRITE", async () => {
    hasStaffRole.mockResolvedValue(false);
    const g = await backOfficeGate(event, ctx, "write");

    expect(g.ok).toBe(false);
  });

  // ⚠ A refusal that varied with the shop or product would be a discovery tool for which shops exist.
  it("refuses identically whichever shop is named", async () => {
    hasStaffRole.mockResolvedValue(false);
    const a = await backOfficeGate({ pathParameters: { shopId: "shop-1" } } as never, ctx, "write");
    const b = await backOfficeGate({ pathParameters: { shopId: "shop-999" } } as never, ctx, "write");

    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) expect(a.response).toEqual(b.response);
  });

  // ⚠ ORDER MATTERS. Checking the shop first would tell an unauthorized caller whether the shop they
  // named exists — before establishing they may ask at all.
  it("decides permission BEFORE looking the shop up", async () => {
    hasStaffRole.mockResolvedValue(false);
    await backOfficeGate(event, ctx, "write");

    expect(query).not.toHaveBeenCalled();
  });

  it("refuses an inactive shop even for a permitted actor", async () => {
    hasStaffRole.mockResolvedValue(true);
    query.mockResolvedValue({ rows: [{ ok: false }] });

    const g = await backOfficeGate(event, ctx, "write");
    expect(g.ok).toBe(false);
  });

  it("marks the actor as back_office so the shop can see who changed their numbers (FR-027)", async () => {
    hasStaffRole.mockResolvedValue(true);
    const g = await backOfficeGate(event, ctx, "write");

    if (!g.ok) throw new Error("expected the gate to pass");
    // ⚠ This is what makes FR-027 possible. `actorKind` is recorded separately from `reason`, so
    // back-office never has to pick a reason that says "back-office did this" — and a shop reading
    // its own history sees the distinction without anyone having remembered to write it down.
    expect(g.actor.kind).toBe("back_office");
    expect(g.actor.sub).toBe("staff-sub");
    // The shop comes from the PATH here (unlike the shop routes, where it is resolved from the
    // caller's own record and never read from input).
    expect(g.actor.shopId).toBe("shop-1");
  });

  it("fails CLOSED when the gate cannot be evaluated", async () => {
    hasStaffRole.mockRejectedValue(new Error("admin schema unreachable"));
    const g = await backOfficeGate(event, ctx, "write");
    expect(g.ok).toBe(false);
  });

  it("refuses when no shop is named at all", async () => {
    const g = await backOfficeGate({ pathParameters: {} } as never, ctx, "read");
    expect(g.ok).toBe(false);
  });
});
