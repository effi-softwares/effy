import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const mk = (tag: string) =>
    class {
      input: unknown;
      tag = tag;
      constructor(input: unknown) {
        this.input = input;
      }
    };
  return {
    CognitoIdentityProviderClient: vi.fn(() => ({ send })),
    AdminCreateUserCommand: mk("create"),
    AdminGetUserCommand: mk("get"),
    AdminAddUserToGroupCommand: mk("addgroup"),
    AdminRemoveUserFromGroupCommand: mk("removegroup"),
    AdminDisableUserCommand: mk("disable"),
    AdminEnableUserCommand: mk("enable"),
    UsernameExistsException: class UsernameExistsException extends Error {
      constructor() {
        super("exists");
        this.name = "UsernameExistsException";
      }
    },
  };
});

import { UsernameExistsException } from "@aws-sdk/client-cognito-identity-provider";

import { disableUser, ensureShopUser, setUserGroups } from "./cognito";

type Cmd = { tag: string; input: Record<string, unknown> };
const calls = (tag: string): Cmd[] =>
  send.mock.calls.map((c) => c[0] as Cmd).filter((c) => c.tag === tag);

describe("cognito shop-pool adapter (009)", () => {
  beforeEach(() => {
    send.mockReset();
    process.env.SHOP_USER_POOL_ID = "pool-1";
  });

  it("ensureShopUser: creates (no password, SUPPRESS, verified) + adds group, returns sub", async () => {
    send.mockImplementation(async (cmd: Cmd) => {
      if (cmd.tag === "create") {
        return { User: { Username: "user-uuid", Attributes: [{ Name: "sub", Value: "sub-1" }] } };
      }
      return {};
    });

    const sub = await ensureShopUser("sam@effy.test", "Sam", "shop_manager");
    expect(sub).toBe("sub-1");

    const create = calls("create")[0]!;
    expect(create.input.MessageAction).toBe("SUPPRESS");
    expect(create.input.UserAttributes).toContainEqual({ Name: "email_verified", Value: "true" });
    expect(create.input).not.toHaveProperty("TemporaryPassword");
    expect(calls("addgroup")[0]!.input.GroupName).toBe("shop_manager");
  });

  it("ensureShopUser: idempotent on an existing user (recovers sub via AdminGetUser)", async () => {
    send.mockImplementation(async (cmd: Cmd) => {
      if (cmd.tag === "create") throw new (UsernameExistsException as unknown as { new (): Error })();
      if (cmd.tag === "get") {
        return { Username: "user-uuid", UserAttributes: [{ Name: "sub", Value: "sub-1" }], Enabled: true };
      }
      return {};
    });

    expect(await ensureShopUser("sam@effy.test", "Sam", "shop_staff")).toBe("sub-1");
    expect(calls("addgroup")[0]!.input.GroupName).toBe("shop_staff");
  });

  it("setUserGroups reconciles: adds the wanted role, removes the other", async () => {
    send.mockResolvedValue({});
    await setUserGroups("al@effy.test", ["shop_manager"]);
    expect(calls("addgroup").map((c) => c.input.GroupName)).toEqual(["shop_manager"]);
    expect(calls("removegroup").map((c) => c.input.GroupName)).toEqual(["shop_staff"]);
  });

  it("disableUser targets the shop pool", async () => {
    send.mockResolvedValue({});
    await disableUser("al@effy.test");
    expect(calls("disable")[0]!.input).toMatchObject({ UserPoolId: "pool-1", Username: "al@effy.test" });
  });
});
