// Shop-pool Cognito Admin adapter (009). A back-office-authenticated caller provisions identities
// in the SHOP pool — an authorized server-side provisioning write, NOT cross-pool authentication
// (research R3; the routes still carry the back-office authorizer). Mirrors the 006 first-admin
// pattern: AdminCreateUser with no password, SUPPRESS invite, email_verified — so the user lands
// CONFIRMED on a passwordless pool — then group membership. Idempotent on re-run.
//
// No DI framework: a module-singleton client, wired by hand (Principle VI). The pool id is injected
// as SHOP_USER_POOL_ID (resolved from /effy/<env>/auth/shop/user_pool_id at deploy time).
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";

import { SHOP_ROLES, type ShopRole } from "./types";

let client: CognitoIdentityProviderClient | undefined;

function getClient(): CognitoIdentityProviderClient {
  if (!client) client = new CognitoIdentityProviderClient({});
  return client;
}

function poolId(): string {
  const id = process.env.SHOP_USER_POOL_ID;
  if (!id) throw new Error("cognito: SHOP_USER_POOL_ID is not set");
  return id;
}

function subFromAttrs(attrs: AttributeType[] | undefined): string {
  const sub = attrs?.find((a) => a.Name === "sub")?.Value;
  if (!sub) throw new Error("cognito: no sub attribute in response");
  return sub;
}

/**
 * Ensure a shop-pool account for `email` in `group`, returning the stable `sub` (the DB join key).
 * Idempotent: a second call for the same email recovers the sub via AdminGetUser and re-enables a
 * disabled account (break-glass parity with 006). The email is the admin username identifier (the
 * shop pool signs in by email).
 */
export async function ensureShopUser(
  email: string,
  name: string,
  group: ShopRole,
): Promise<string> {
  const c = getClient();
  const UserPoolId = poolId();
  let sub: string;
  let username: string;

  try {
    const created = await c.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: name },
        ],
        // No TemporaryPassword — required to land the user CONFIRMED on a passwordless pool.
      }),
    );
    sub = subFromAttrs(created.User?.Attributes);
    username = created.User?.Username ?? email;
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    const got = await c.send(new AdminGetUserCommand({ UserPoolId, Username: email }));
    sub = subFromAttrs(got.UserAttributes);
    username = got.Username ?? email;
    if (got.Enabled === false) {
      await c.send(new AdminEnableUserCommand({ UserPoolId, Username: username }));
    }
  }

  await c.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: username, GroupName: group }));
  return sub;
}

/** Reconcile a user's shop groups to exactly `roles` (add missing, remove the rest). The claim is
 *  the ORIGIN the shop service reconciles from, so a role change MUST touch Cognito (research R5). */
export async function setUserGroups(email: string, roles: readonly ShopRole[]): Promise<void> {
  const c = getClient();
  const UserPoolId = poolId();
  for (const g of SHOP_ROLES) {
    if (roles.includes(g)) {
      await c.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: email, GroupName: g }));
    } else {
      await c.send(
        new AdminRemoveUserFromGroupCommand({ UserPoolId, Username: email, GroupName: g }),
      );
    }
  }
}

/** Disable the identity account (defense in depth — a disabled user cannot obtain a session, Q1). */
export async function disableUser(email: string): Promise<void> {
  await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: email }));
}

export async function enableUser(email: string): Promise<void> {
  await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: email }));
}
