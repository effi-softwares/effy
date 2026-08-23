// Driver-pool Cognito Admin adapter (049). A back-office-authenticated caller provisions identities
// in the DRIVER pool — an authorized server-side provisioning write, NOT cross-pool authentication
// (research R3/R9; the routes still carry the back-office authorizer). Mirrors the 006/009 pattern:
// AdminCreateUser with no password, SUPPRESS invite, email_verified — so the driver lands CONFIRMED
// on a passwordless pool. Idempotent on re-run.
//
// ⚠ Unlike shops, the DRIVER pool defines NO RBAC groups (Principle IV) — there is no group step.
// A driver's status/zone live entirely in the platform `public.driver` record.
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";

let client: CognitoIdentityProviderClient | undefined;

function getClient(): CognitoIdentityProviderClient {
  if (!client) client = new CognitoIdentityProviderClient({});
  return client;
}

function poolId(): string {
  const id = process.env.DRIVER_USER_POOL_ID;
  if (!id) throw new Error("cognito: DRIVER_USER_POOL_ID is not set");
  return id;
}

function subFromAttrs(attrs: AttributeType[] | undefined): string {
  const sub = attrs?.find((a) => a.Name === "sub")?.Value;
  if (!sub) throw new Error("cognito: no sub attribute in response");
  return sub;
}

/**
 * Ensure a driver-pool account for `email`, returning the stable `sub` (the DB join key).
 * Idempotent: a second call recovers the sub via AdminGetUser and re-enables a disabled account.
 */
export async function ensureDriverUser(email: string, name: string): Promise<string> {
  const c = getClient();
  const UserPoolId = poolId();

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
        // No TemporaryPassword — required to land CONFIRMED on a passwordless pool.
      }),
    );
    return subFromAttrs(created.User?.Attributes);
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    const got = await c.send(new AdminGetUserCommand({ UserPoolId, Username: email }));
    if (got.Enabled === false) {
      await c.send(new AdminEnableUserCommand({ UserPoolId, Username: got.Username ?? email }));
    }
    return subFromAttrs(got.UserAttributes);
  }
}

/** Disable the identity account (defense in depth — a disabled user cannot obtain a session). */
export async function disableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: email }));
}

export async function enableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: email }));
}
