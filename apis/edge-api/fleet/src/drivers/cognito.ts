// Provisions driver-pool identities (AdminCreateUser, no password, invite suppressed, so the driver
// lands confirmed). The driver pool has no groups: status and zones live in `public.driver`. Creating
// fails loudly on a duplicate; enabling and disabling are separate operations, so "add a driver" can
// never edit or reactivate an existing one.
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  UserNotFoundException,
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

/** Not swallowed. */
export class DriverUserExistsError extends Error {
  constructor(readonly email: string) {
    super(`a driver-pool account already exists for ${email}`);
    this.name = "DriverUserExistsError";
  }
}

/** Returns the stable `sub`. Not idempotent: a duplicate throws `DriverUserExistsError` (a named 409). */
export async function createDriverUser(email: string, name: string): Promise<string> {
  try {
    const created = await getClient().send(
      new AdminCreateUserCommand({
        UserPoolId: poolId(),
        Username: email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: name },
        ],
        // No TemporaryPassword, so the driver lands confirmed.
      }),
    );
    return subFromAttrs(created.User?.Attributes);
  } catch (err) {
    if (err instanceof UsernameExistsException) throw new DriverUserExistsError(email);
    throw err;
  }
}

/** `null` when there is no account; a half-provisioned driver shows the discrepancy. */
export async function lookupDriverUser(
  email: string,
): Promise<{ sub: string; enabled: boolean } | null> {
  try {
    const got = await getClient().send(
      new AdminGetUserCommand({ UserPoolId: poolId(), Username: email }),
    );
    return { sub: subFromAttrs(got.UserAttributes), enabled: got.Enabled !== false };
  } catch (err) {
    if (err instanceof UserNotFoundException) return null;
    throw err;
  }
}

/** Defence in depth: no session can be obtained even if the record check were bypassed. */
export async function disableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: email }));
}

export async function enableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: email }));
}
