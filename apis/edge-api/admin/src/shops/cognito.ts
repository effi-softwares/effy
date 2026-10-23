// Provisions shop-pool identities: AdminCreateUser with no password and the invite suppressed, so the
// user lands confirmed on a passwordless pool, then group membership. Idempotent.
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

/** Returns the stable `sub`. A repeat recovers it via AdminGetUser and re-enables a disabled account. */
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
        // No TemporaryPassword, so the user lands confirmed.
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

/** Exactly `roles`: the shop service reconciles from the claim, so a role change must touch Cognito. */
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

/** A disabled user cannot obtain a session. */
export async function disableUser(email: string): Promise<void> {
  await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: email }));
}

export async function enableUser(email: string): Promise<void> {
  await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: email }));
}
