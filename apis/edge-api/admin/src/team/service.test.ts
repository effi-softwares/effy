import { beforeEach, describe, expect, it, vi } from "vitest";

// The writer is SQL (proven in shared's team.container.test.ts); here each write is a recorded step, so the ORDER of
// research R5 is what is tested: the record first, then the pool, then the emails, then the announcement.
const log: string[] = [];
const w = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  addMember: vi.fn(),
  setStatus: vi.fn(),
  changeRole: vi.fn(),
  removeMember: vi.fn(),
  noteSignedOut: vi.fn(),
  claimInvitation: vi.fn(),
  recordInvitation: vi.fn(),
  recordSignInStep: vi.fn(),
  readMember: vi.fn(),
  otherActiveAdmins: vi.fn(),
  actorName: vi.fn(),
}));
vi.mock("@effy/edge-shared/team", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared/team")>()),
  ...w,
}));
vi.mock("@effy/edge-shared/live", () => ({ announce: vi.fn() }));

import { TeamRefusalError, type SignInPort } from "@effy/edge-shared/team";

import { teamService } from "./service";

const MEMBER = { id: "m-1", subject: "sub-1", email: "jo@x.test", name: "Jo", role: "csa", status: "active", signInIssue: null };

function fakePort(fail: Partial<Record<keyof SignInPort, boolean>> = {}): SignInPort {
  const step = (name: keyof SignInPort, out: unknown = undefined) =>
    vi.fn(async (...args: unknown[]) => {
      log.push(`pool.${name}${args[1] !== undefined && typeof args[1] !== "object" ? `:${String(args[1])}` : ""}`);
      if (fail[name]) throw new Error(`${name} failed`);
      return out;
    });
  return {
    create: step("create", { username: "u-1", sub: "sub-1", email: "jo@x.test", enabled: true, groups: [], createdAt: null, adopted: false }),
    get: step("get", null),
    enable: step("enable"),
    disable: step("disable"),
    delete: step("delete", true),
    setGroup: step("setGroup"),
    globalSignOut: step("globalSignOut"),
    listAll: step("listAll", []),
  } as unknown as SignInPort;
}

function service(port = fakePort()) {
  return teamService({
    transact: async (fn) => fn({ query: vi.fn() } as never),
    db: { query: vi.fn() } as never,
    port: () => port,
    mail: {
      invitation: vi.fn(async (to: string) => {
        log.push(`mail.invitation:${to}`);
        return "msg-1";
      }),
      adminGranted: vi.fn(async (to: string) => {
        log.push(`mail.adminGranted:${to}`);
      }),
    },
    announce: vi.fn(async () => {
      log.push("announce");
    }),
    now: () => new Date("2026-11-13T00:00:00Z"),
  });
}

const caller = { sub: "sub-admin" };

beforeEach(() => {
  log.length = 0;
  for (const fn of Object.values(w)) fn.mockReset();
  w.findByEmail.mockResolvedValue(null);
  w.addMember.mockImplementation(async () => (log.push("db.add"), { staffId: "m-1", readded: false }));
  w.recordSignInStep.mockImplementation(async (_tx, _a, _id, step, err) => (log.push(`db.step:${step}:${err ? "failed" : "ok"}`), err === null));
  w.readMember.mockResolvedValue(MEMBER);
  w.claimInvitation.mockImplementation(async () => (log.push("db.claimInvitation"), { email: "jo@x.test", role: "csa" }));
  w.recordInvitation.mockImplementation(async () => void log.push("db.recordInvitation"));
  w.otherActiveAdmins.mockResolvedValue([{ email: "ann@x.test", name: "Ann" }]);
  w.actorName.mockResolvedValue("Ann");
});

describe("add (US1)", () => {
  it("pool account, then the record, then the group, the invitation, the announcement", async () => {
    const out = await service().add(caller, { email: " Jo@X.test ", name: "Jo", role: "csa", invite: true });
    expect(out.complete).toBe(true);
    expect(log).toEqual([
      "pool.create:Jo",
      "db.add",
      "pool.setGroup:csa",
      "db.step:group:ok",
      "db.claimInvitation",
      "mail.invitation:jo@x.test",
      "db.recordInvitation",
      "announce",
    ]);
    expect(w.addMember.mock.calls[0]![2]).toMatchObject({ email: "jo@x.test", sub: "sub-1", invite: true });
  });

  it("no invitation when unticked; an Administrator is announced to every other one (FR-016)", async () => {
    await service().add(caller, { email: "jo@x.test", name: "Jo", role: "admin", invite: false });
    expect(log).not.toContain("mail.invitation:jo@x.test");
    expect(log).toContain("mail.adminGranted:ann@x.test");
  });

  it("an email already on the team is refused before the pool is touched", async () => {
    w.findByEmail.mockResolvedValue({ id: "m-9", status: "active" });
    await expect(service().add(caller, { email: "jo@x.test", name: "Jo", role: "csa" })).rejects.toMatchObject({
      type: "already_on_team",
      extra: { memberId: "m-9" },
    });
    w.findByEmail.mockResolvedValue({ id: "m-9", status: "disabled" });
    await expect(service().add(caller, { email: "jo@x.test", name: "Jo", role: "csa" })).rejects.toMatchObject({ type: "disabled_on_team" });
    expect(log).toEqual([]);
  });

  it("a failed group step says the change did not complete (FR-032)", async () => {
    const out = await service(fakePort({ setGroup: true })).add(caller, { email: "jo@x.test", name: "Jo", role: "csa", invite: false });
    expect(out.complete).toBe(false);
    expect(log).toContain("db.step:group:failed");
  });

  it.each([
    [{ email: "nope", name: "Jo", role: "csa" }, "email"],
    [{ email: "jo@x.test", name: "  ", role: "csa" }, "name"],
    [{ email: "jo@x.test", name: "x".repeat(121), role: "csa" }, "name"],
    [{ email: "jo@x.test", name: "Jo", role: "owner" }, "role"],
  ])("refuses %j (%s)", async (body, field) => {
    await expect(service().add(caller, body)).rejects.toMatchObject({ field });
    expect(log).toEqual([]);
  });
});

describe("disable, re-enable, role, remove, sign out", () => {
  it("disable: the record first, then sign-in off and every session ended", async () => {
    w.setStatus.mockImplementation(async () => (log.push("db.disable"), { role: "csa", changed: true }));
    await service().setStatus(caller, "m-1", { status: "disabled", expectedRevision: 3 });
    expect(log).toEqual(["db.disable", "pool.disable", "db.step:disable:ok", "pool.globalSignOut", "db.step:sign_out:ok", "announce"]);
    expect(w.setStatus.mock.calls[0]![4]).toMatchObject({ expectedRevision: 3 });
  });

  it("re-enable as an Administrator tells the others", async () => {
    w.setStatus.mockImplementation(async () => (log.push("db.enable"), { role: "admin", changed: true }));
    await service().setStatus(caller, "m-1", { status: "active" });
    expect(log.slice(0, 5)).toEqual(["db.enable", "pool.enable", "db.step:enable:ok", "pool.setGroup:admin", "db.step:group:ok"]);
    expect(log).toContain("mail.adminGranted:ann@x.test");
  });

  it("lowering a role also signs out everywhere (FR-015); raising does not", async () => {
    w.changeRole.mockResolvedValue({ from: "manager", to: "csa", changed: true });
    await service().changeRole(caller, "m-1", { role: "csa" });
    expect(log).toContain("pool.globalSignOut");
    log.length = 0;
    w.changeRole.mockResolvedValue({ from: "csa", to: "manager", changed: true });
    await service().changeRole(caller, "m-1", { role: "manager" });
    expect(log).not.toContain("pool.globalSignOut");
  });

  it("remove deletes the sign-in account after the record says Removed", async () => {
    w.removeMember.mockImplementation(async () => void log.push("db.remove"));
    await service().remove(caller, "m-1", "4");
    expect(log).toEqual(["db.remove", "pool.delete", "db.step:delete:ok", "announce"]);
    expect(w.removeMember.mock.calls[0]![3]).toBe(4);
  });

  it("sign out everywhere: recorded first; a pool failure is 502 sign_in_unavailable", async () => {
    w.noteSignedOut.mockImplementation(async () => (log.push("db.signedOut"), { email: "jo@x.test" }));
    await expect(service(fakePort({ globalSignOut: true })).signOut(caller, "m-1")).rejects.toBeInstanceOf(TeamRefusalError);
    expect(log.slice(0, 2)).toEqual(["db.signedOut", "pool.globalSignOut"]);
  });
});
