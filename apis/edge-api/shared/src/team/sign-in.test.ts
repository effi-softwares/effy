import { describe, expect, it, vi } from "vitest";

import { cognitoSignIn, SignInError, type CognitoCommands } from "./sign-in";

// Each fake command records its name and input; `send` answers by name.
function commands(): CognitoCommands {
  const make = (name: string) =>
    class {
      readonly name = name;
      constructor(readonly input: Record<string, unknown>) {}
    };
  return {
    AdminCreateUserCommand: make("create"),
    AdminGetUserCommand: make("get"),
    AdminEnableUserCommand: make("enable"),
    AdminDisableUserCommand: make("disable"),
    AdminDeleteUserCommand: make("delete"),
    AdminAddUserToGroupCommand: make("add"),
    AdminRemoveUserFromGroupCommand: make("remove"),
    AdminListGroupsForUserCommand: make("groups"),
    AdminUserGlobalSignOutCommand: make("signout"),
    ListUsersCommand: make("list"),
    ListUsersInGroupCommand: make("inGroup"),
  } as unknown as CognitoCommands;
}

type Cmd = { name: string; input: Record<string, unknown> };
const err = (name: string) => Object.assign(new Error(name), { name });
const user = (username: string, sub: string, email: string, enabled = true) => ({
  Username: username,
  Enabled: enabled,
  Attributes: [
    { Name: "sub", Value: sub },
    { Name: "email", Value: email },
  ],
});

function port(answer: (c: Cmd) => unknown) {
  const sent: Cmd[] = [];
  const send = vi.fn(async (c: Cmd) => {
    sent.push(c);
    const a = answer(c);
    if (a instanceof Error) throw a;
    return a;
  });
  return { sent, p: cognitoSignIn({ send: send as never }, "pool-1", commands()) };
}

describe("the back-office sign-in port", () => {
  it("creates a passwordless, verified account with no message", async () => {
    const { sent, p } = port((c) => (c.name === "create" ? { User: user("u-1", "sub-1", "jo@x.test") } : {}));
    const made = await p.create("jo@x.test", "Jo");
    expect(made).toMatchObject({ username: "u-1", sub: "sub-1", adopted: false });
    expect(sent[0]!.input).toMatchObject({ UserPoolId: "pool-1", Username: "jo@x.test", MessageAction: "SUPPRESS" });
    expect(sent[0]!.input.UserAttributes).toContainEqual({ Name: "email_verified", Value: "true" });
  });

  it("adopts an account that already exists instead of failing (a safe retry)", async () => {
    const { p } = port((c) => {
      if (c.name === "create") return err("UsernameExistsException");
      if (c.name === "get") return { ...user("u-2", "sub-2", "jo@x.test"), UserAttributes: user("u-2", "sub-2", "jo@x.test").Attributes };
      if (c.name === "groups") return { Groups: [{ GroupName: "csa" }, { GroupName: "other" }] };
      return {};
    });
    expect(await p.create("jo@x.test", "Jo")).toMatchObject({ sub: "sub-2", adopted: true, groups: ["csa"] });
  });

  it("get answers null for an account that does not exist", async () => {
    const { p } = port(() => err("UserNotFoundException"));
    expect(await p.get("nobody@x.test")).toBeNull();
  });

  it("setGroup leaves exactly the one role's group", async () => {
    const { sent, p } = port((c) => (c.name === "groups" ? { Groups: [{ GroupName: "admin" }, { GroupName: "csa" }] } : {}));
    await p.setGroup("u-1", "csa");
    expect(sent.filter((c) => c.name === "remove").map((c) => c.input.GroupName)).toEqual(["admin"]);
    expect(sent.some((c) => c.name === "add")).toBe(false);
  });

  it("setGroup adds the role's group when missing, and null removes all", async () => {
    const a = port((c) => (c.name === "groups" ? { Groups: [{ GroupName: "manager" }] } : {}));
    await a.p.setGroup("u-1", "admin");
    expect(a.sent.filter((c) => c.name !== "groups").map((c) => [c.name, c.input.GroupName])).toEqual([
      ["remove", "manager"],
      ["add", "admin"],
    ]);
    const b = port((c) => (c.name === "groups" ? { Groups: [{ GroupName: "manager" }] } : {}));
    await b.p.setGroup("u-1", null);
    expect(b.sent.filter((c) => c.name === "add")).toEqual([]);
  });

  it("delete is false when the account was already gone", async () => {
    const { p } = port(() => err("UserNotFoundException"));
    expect(await p.delete("u-1")).toBe(false);
  });

  it("listAll pages users and joins each group's members", async () => {
    const { p } = port((c) => {
      if (c.name === "list") {
        return c.input.PaginationToken
          ? { Users: [user("u-2", "sub-2", "B@x.test", false)] }
          : { Users: [user("u-1", "sub-1", "a@x.test")], PaginationToken: "t" };
      }
      if (c.name === "inGroup") return c.input.GroupName === "manager" ? { Users: [{ Username: "u-1" }] } : { Users: [] };
      return {};
    });
    expect(await p.listAll()).toEqual([
      { username: "u-1", sub: "sub-1", email: "a@x.test", enabled: true, groups: ["manager"], createdAt: null },
      { username: "u-2", sub: "sub-2", email: "b@x.test", enabled: false, groups: [], createdAt: null },
    ]);
  });

  it("names the step that failed", async () => {
    const { p } = port(() => err("TooManyRequestsException"));
    const e = await p.disable("u-1").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SignInError);
    expect(e).toMatchObject({ step: "disable", code: "TooManyRequestsException" });
  });
});
