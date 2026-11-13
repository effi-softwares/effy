// The back-office sign-in pool, as the team sees it (research R5, R6). The pool is the record's MIRROR: the writer
// changes the record first and this port second, and nothing here decides access.
//
// The AWS SDK is not a dependency of this library: the caller passes its own client and the command classes
// (`import * as cognito from "@aws-sdk/client-cognito-identity-provider"`), so `admin-team` and the operator tool use
// one adapter without this package pinning a second SDK copy.
import { BACK_OFFICE_ROLES, type BackOfficeRole } from "@effy/shared-types";

export interface SignInAccount {
  /** The pool's username (a UUID in a pool whose sign-in name is the email). */
  username: string;
  sub: string;
  email: string | null;
  enabled: boolean;
  /** Back-office groups only (admin, manager, csa). */
  groups: BackOfficeRole[];
  createdAt: string | null;
}

export interface SignInPort {
  /** A passwordless, verified account with no message. An existing one is ADOPTED (`adopted: true`), never an error. */
  create(email: string, name: string): Promise<SignInAccount & { adopted: boolean }>;
  /** By username or email; null when there is none. */
  get(usernameOrEmail: string): Promise<SignInAccount | null>;
  enable(username: string): Promise<void>;
  disable(username: string): Promise<void>;
  /** False when it was already gone. */
  delete(username: string): Promise<boolean>;
  /** Exactly `role`'s group (or none): the other two are removed. */
  setGroup(username: string, role: BackOfficeRole | null): Promise<void>;
  /** Ends every refresh token. An access token already in a browser lives on; every gate reads the record. */
  globalSignOut(username: string): Promise<void>;
  /** Every account, with its groups. */
  listAll(): Promise<SignInAccount[]>;
}

/** The pool refused or did not answer. `step` names the call for the record's Needs attention. */
export class SignInError extends Error {
  constructor(
    readonly step: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SignInError";
  }
}

// ── The Cognito adapter ────────────────────────────────────────────────────────────────────────────────────────────

type Ctor = new (input: never) => unknown;

/** The command classes this adapter sends (a subset of the SDK module). */
export interface CognitoCommands {
  AdminCreateUserCommand: Ctor;
  AdminGetUserCommand: Ctor;
  AdminEnableUserCommand: Ctor;
  AdminDisableUserCommand: Ctor;
  AdminDeleteUserCommand: Ctor;
  AdminAddUserToGroupCommand: Ctor;
  AdminRemoveUserFromGroupCommand: Ctor;
  AdminListGroupsForUserCommand: Ctor;
  AdminUserGlobalSignOutCommand: Ctor;
  ListUsersCommand: Ctor;
  ListUsersInGroupCommand: Ctor;
}

export interface CognitoSender {
  send(command: never): Promise<unknown>;
}

interface Attr {
  Name?: string;
  Value?: string;
}
interface PoolUser {
  Username?: string;
  Attributes?: Attr[];
  UserAttributes?: Attr[];
  Enabled?: boolean;
  UserCreateDate?: Date;
}

const PAGE = 60;
const named = (err: unknown, name: string) => (err as { name?: string } | null)?.name === name;
const attr = (attrs: Attr[] | undefined, name: string) => attrs?.find((a) => a.Name === name)?.Value ?? null;
const roleGroups = (names: readonly (string | undefined)[]): BackOfficeRole[] =>
  BACK_OFFICE_ROLES.filter((r) => names.includes(r));

export function cognitoSignIn(client: CognitoSender, poolId: string, commands: CognitoCommands): SignInPort {
  async function send<T>(step: string, Command: Ctor, input: Record<string, unknown>): Promise<T> {
    try {
      return (await client.send(new Command({ UserPoolId: poolId, ...input } as never) as never)) as T;
    } catch (err) {
      const code = (err as { name?: string } | null)?.name ?? "Error";
      throw new SignInError(step, code, `${step}: ${(err as Error).message ?? code}`);
    }
  }

  async function groupsOf(username: string): Promise<BackOfficeRole[]> {
    const res = await send<{ Groups?: { GroupName?: string }[] }>("groups", commands.AdminListGroupsForUserCommand, {
      Username: username,
      Limit: PAGE,
    });
    return roleGroups((res.Groups ?? []).map((g) => g.GroupName));
  }

  function toAccount(u: PoolUser, groups: BackOfficeRole[]): SignInAccount {
    const attrs = u.Attributes ?? u.UserAttributes;
    const sub = attr(attrs, "sub");
    if (!sub || !u.Username) throw new SignInError("read", "NoSub", "cognito: an account has no username or sub");
    return {
      username: u.Username,
      sub,
      email: attr(attrs, "email")?.toLowerCase() ?? null,
      enabled: u.Enabled !== false,
      groups,
      createdAt: u.UserCreateDate ? new Date(u.UserCreateDate).toISOString() : null,
    };
  }

  const port: SignInPort = {
    async create(email, name) {
      try {
        const created = await send<{ User?: PoolUser }>("create", commands.AdminCreateUserCommand, {
          Username: email,
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "name", Value: name },
          ],
        });
        return { ...toAccount(created.User ?? {}, []), adopted: false };
      } catch (err) {
        if (!(err instanceof SignInError) || err.code !== "UsernameExistsException") throw err;
        const existing = await port.get(email);
        if (!existing) throw new SignInError("create", "Vanished", "cognito: the existing account could not be read");
        return { ...existing, adopted: true };
      }
    },

    async get(usernameOrEmail) {
      let got: PoolUser;
      try {
        got = await send<PoolUser>("get", commands.AdminGetUserCommand, { Username: usernameOrEmail });
      } catch (err) {
        if (err instanceof SignInError && err.code === "UserNotFoundException") return null;
        throw err;
      }
      return toAccount(got, await groupsOf(got.Username ?? usernameOrEmail));
    },

    async enable(username) {
      await send("enable", commands.AdminEnableUserCommand, { Username: username });
    },

    async disable(username) {
      await send("disable", commands.AdminDisableUserCommand, { Username: username });
    },

    async delete(username) {
      try {
        await send("delete", commands.AdminDeleteUserCommand, { Username: username });
        return true;
      } catch (err) {
        if (err instanceof SignInError && err.code === "UserNotFoundException") return false;
        throw err;
      }
    },

    async setGroup(username, role) {
      const held = await groupsOf(username);
      for (const g of held) {
        if (g !== role) await send("group", commands.AdminRemoveUserFromGroupCommand, { Username: username, GroupName: g });
      }
      if (role && !held.includes(role)) {
        await send("group", commands.AdminAddUserToGroupCommand, { Username: username, GroupName: role });
      }
    },

    async globalSignOut(username) {
      await send("sign_out", commands.AdminUserGlobalSignOutCommand, { Username: username });
    },

    async listAll() {
      const users: PoolUser[] = [];
      let token: string | undefined;
      do {
        const page = await send<{ Users?: PoolUser[]; PaginationToken?: string }>("list", commands.ListUsersCommand, {
          Limit: PAGE,
          ...(token ? { PaginationToken: token } : {}),
        });
        users.push(...(page.Users ?? []));
        token = page.PaginationToken;
      } while (token);

      const groups = new Map<string, BackOfficeRole[]>();
      for (const role of BACK_OFFICE_ROLES) {
        let next: string | undefined;
        do {
          const page = await send<{ Users?: PoolUser[]; NextToken?: string }>("list", commands.ListUsersInGroupCommand, {
            GroupName: role,
            Limit: PAGE,
            ...(next ? { NextToken: next } : {}),
          });
          for (const u of page.Users ?? []) {
            if (!u.Username) continue;
            groups.set(u.Username, [...(groups.get(u.Username) ?? []), role]);
          }
          next = page.NextToken;
        } while (next);
      }
      return users.map((u) => toAccount(u, roleGroups(groups.get(u.Username ?? "") ?? [])));
    },
  };
  return port;
}

/** Whether `err` says the account does not exist. */
export function isMissingAccount(err: unknown): boolean {
  return err instanceof SignInError ? err.code === "UserNotFoundException" : named(err, "UserNotFoundException");
}

/** The pool id, required (no default: a team change must never go to a guessed pool). */
export function backOfficePoolId(env: NodeJS.ProcessEnv = process.env): string {
  const id = env.BACK_OFFICE_USER_POOL_ID;
  if (!id) throw new Error("BACK_OFFICE_USER_POOL_ID is not set");
  return id;
}
