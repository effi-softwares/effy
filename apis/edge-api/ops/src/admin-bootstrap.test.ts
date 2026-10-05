import { describe, expect, it } from "vitest";

import {
  cognitoIdentityProvider, createFirstAdmin, deleteAdmin, LastAdminError, validateInput,
  type IdentityProvider, type StaffRecords,
} from "./admin-bootstrap";

/** A Cognito that remembers what it was asked, and answers from a small script. */
function fakeCognito(script: { createFails?: string; existing?: { enabled: boolean }; getFails?: string; deleteFails?: string } = {}) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const fail = (name: string) => Object.assign(new Error(name), { name });
  const send = async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const name = cmd.constructor.name.replace(/Command$/, "");
    calls.push({ name, input: cmd.input });
    if (name === "AdminCreateUser") {
      if (script.createFails) throw fail(script.createFails);
      return { User: { Username: "uuid-username", Attributes: [{ Name: "sub", Value: "sub-new" }] } };
    }
    if (name === "AdminGetUser") {
      if (script.getFails) throw fail(script.getFails);
      return { Username: "uuid-existing", Enabled: script.existing?.enabled ?? true, UserAttributes: [{ Name: "sub", Value: "sub-existing" }] };
    }
    if (name === "AdminDeleteUser" && script.deleteFails) throw fail(script.deleteFails);
    return {};
  };
  return { idp: cognitoIdentityProvider({ send } as never, "pool-1"), calls, names: () => calls.map((c) => c.name) };
}

describe("the identity provider half", () => {
  it("creates a confirmed, passwordless user with the invitation suppressed, then adds the admin group", async () => {
    const c = fakeCognito();
    expect(await c.idp.ensureAdmin("jane@effy.test", "Jane Doe")).toEqual({ sub: "sub-new", outcome: "created" });
    expect(c.names()).toEqual(["AdminCreateUser", "AdminAddUserToGroup"]);

    const create = c.calls[0]!.input;
    expect(create).toMatchObject({ UserPoolId: "pool-1", Username: "jane@effy.test", MessageAction: "SUPPRESS" });
    // ⚠ No temporary password: with one, the user lands in FORCE_CHANGE_PASSWORD and cannot sign in
    // with a one-time code on a pool that has no passwords.
    expect(create).not.toHaveProperty("TemporaryPassword");
    expect(create.UserAttributes).toEqual([
      { Name: "email", Value: "jane@effy.test" }, { Name: "email_verified", Value: "true" }, { Name: "name", Value: "Jane Doe" },
    ]);
    // The group is added by the provider's own username, not the email.
    expect(c.calls[1]!.input).toEqual({ UserPoolId: "pool-1", Username: "uuid-username", GroupName: "admin" });
  });

  it("reconciles an existing user instead of failing, and re-enables a disabled one", async () => {
    const enabled = fakeCognito({ createFails: "UsernameExistsException" });
    expect(await enabled.idp.ensureAdmin("jane@effy.test", "Jane")).toEqual({ sub: "sub-existing", outcome: "already-exists" });
    expect(enabled.names()).toEqual(["AdminCreateUser", "AdminGetUser", "AdminAddUserToGroup"]);

    const disabled = fakeCognito({ createFails: "UsernameExistsException", existing: { enabled: false } });
    await disabled.idp.ensureAdmin("jane@effy.test", "Jane");
    expect(disabled.names()).toEqual(["AdminCreateUser", "AdminGetUser", "AdminEnableUser", "AdminAddUserToGroup"]);
  });

  it("any other create failure stops the run before anything else is attempted", async () => {
    const c = fakeCognito({ createFails: "NotAuthorizedException" });
    await expect(c.idp.ensureAdmin("jane@effy.test", "Jane")).rejects.toThrow(/AdminCreateUser/);
    expect(c.names()).toEqual(["AdminCreateUser"]);
  });

  it("resolving or deleting a user who is not there is an answer, not an error", async () => {
    expect(await fakeCognito({ getFails: "UserNotFoundException" }).idp.resolveAdmin("x@effy.test")).toBeNull();
    expect(await fakeCognito({ deleteFails: "UserNotFoundException" }).idp.deleteAdmin("u")).toBe(false);
    expect(await fakeCognito().idp.deleteAdmin("u")).toBe(true);
    await expect(fakeCognito({ getFails: "TooManyRequestsException" }).idp.resolveAdmin("x@effy.test")).rejects.toThrow(/AdminGetUser/);
  });
});

function fakes(over: { found?: { sub: string; username: string } | null; last?: boolean; staff?: "deleted" | "not-found" } = {}) {
  const log: string[] = [];
  const idp: IdentityProvider = {
    ensureAdmin: async () => { log.push("idp.ensure"); return { sub: "sub-1", outcome: "created" }; },
    resolveAdmin: async () => (over.found === undefined ? { sub: "sub-1", username: "u-1" } : over.found),
    deleteAdmin: async () => { log.push("idp.delete"); return true; },
  };
  const records: StaffRecords = {
    upsertSuperAdmin: async (sub) => { log.push(`db.upsert:${sub}`); return "created"; },
    isLastActiveAdmin: async () => over.last ?? false,
    deleteAdmin: async (sub, email) => { log.push(`db.delete:${sub || email}`); return over.staff ?? "deleted"; },
  };
  return { idp, records, log };
}

describe("creating the first admin", () => {
  it("validates before any side effect", async () => {
    const f = fakes();
    await expect(createFirstAdmin(f.idp, f.records, "not-an-email", "Jane")).rejects.toThrow(/invalid email/);
    await expect(createFirstAdmin(f.idp, f.records, "jane@effy.test", "   ")).rejects.toThrow(/name is required/);
    expect(f.log).toEqual([]);
  });

  it("refuses the forms an email argument must never take", () => {
    for (const bad of ["", "jane", "jane@", "@effy.test", "Jane <jane@effy.test>", "a@b.c, d@e.f", "jane @effy.test"]) {
      expect(() => validateInput(bad, "Jane"), bad).toThrow(/invalid email/);
    }
    expect(() => validateInput("jane.doe+ops@effy.test", "Jane")).not.toThrow();
  });

  it("writes the identity first, then the record keyed on the subject it returned", async () => {
    const f = fakes();
    expect(await createFirstAdmin(f.idp, f.records, "jane@effy.test", "Jane Doe")).toEqual({
      email: "jane@effy.test", sub: "sub-1", cognito: "created", group: "admin", staff: "created", role: "admin",
    });
    expect(f.log).toEqual(["idp.ensure", "db.upsert:sub-1"]);
  });
});

describe("deleting an admin", () => {
  it("removes both halves, identity first", async () => {
    const f = fakes();
    expect(await deleteAdmin(f.idp, f.records, "jane@effy.test", false)).toEqual({ email: "jane@effy.test", sub: "sub-1", cognito: "deleted", staff: "deleted" });
    expect(f.log).toEqual(["idp.delete", "db.delete:sub-1"]);
  });

  it("⚠ refuses the last active administrator, touching nothing — unless forced", async () => {
    const f = fakes({ last: true });
    await expect(deleteAdmin(f.idp, f.records, "jane@effy.test", false)).rejects.toBeInstanceOf(LastAdminError);
    expect(f.log).toEqual([]);

    const forced = fakes({ last: true });
    expect((await deleteAdmin(forced.idp, forced.records, "jane@effy.test", true)).cognito).toBe("deleted");
  });

  it("is safe to re-run: an identity already gone still clears the record, by email", async () => {
    const f = fakes({ found: null, staff: "not-found" });
    expect(await deleteAdmin(f.idp, f.records, "jane@effy.test", false)).toEqual({ email: "jane@effy.test", sub: "", cognito: "not-found", staff: "not-found" });
    expect(f.log).toEqual(["db.delete:jane@effy.test"]);
  });

  it("validates the email first", async () => {
    const f = fakes();
    await expect(deleteAdmin(f.idp, f.records, "nope", false)).rejects.toThrow(/invalid email/);
    expect(f.log).toEqual([]);
  });
});
