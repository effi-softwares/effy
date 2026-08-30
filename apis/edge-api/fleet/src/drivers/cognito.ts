// Driver-pool Cognito Admin adapter (056; moved from apis/edge-api/admin/src/drivers/cognito.ts).
//
// A back-office-authenticated caller provisions identities in the DRIVER pool — an authorized
// server-side provisioning write, NOT cross-pool authentication (049 research R3/R9; the routes
// still carry the back-office authorizer). Mirrors the 006/009 pattern: AdminCreateUser with no
// password, SUPPRESS invite, email_verified — so the driver lands CONFIRMED on a passwordless pool.
//
// ⚠ Unlike shops, the DRIVER pool defines NO RBAC groups (Principle IV) — there is no group step.
// A driver's status and zone live entirely in the platform `public.driver` record.
//
// ⚠ THIS IS NOT A VERBATIM MOVE. The 049 original exported one function, `ensureDriverUser`, which
// swallowed UsernameExistsException, RE-ENABLED a disabled account, and returned the existing sub —
// and the repository layered an `ON CONFLICT (cognito_sub) DO UPDATE` on top of it. Together those
// two "helpful" behaviours meant that creating a driver with an email already in use silently EDITED
// that person's record (name, zone, vehicle) and REACTIVATED the sign-in of someone who had been
// deliberately stood down. It reported success. FR-014 requires a refusal instead, so the
// idempotent-ensure is split into an operation that CREATES and fails loudly on a duplicate, and
// separate operations that enable and disable.
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

/** Raised when the driver pool already holds an account for this address. NOT swallowed. */
export class DriverUserExistsError extends Error {
  constructor(readonly email: string) {
    super(`a driver-pool account already exists for ${email}`);
    this.name = "DriverUserExistsError";
  }
}

/**
 * Create a driver-pool account, returning the stable `sub` (the DB join key).
 *
 * ⚠ NOT idempotent, on purpose. A duplicate address throws `DriverUserExistsError`, which the service
 * turns into FR-014's named 409. The old idempotent form is what let "add a new driver" quietly
 * become "overwrite an existing one".
 */
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
        // No TemporaryPassword — required to land CONFIRMED on a passwordless pool.
      }),
    );
    return subFromAttrs(created.User?.Attributes);
  } catch (err) {
    if (err instanceof UsernameExistsException) throw new DriverUserExistsError(email);
    throw err;
  }
}

/** Does the driver pool hold an account for this address, and is it enabled? `null` = no account.
 *  Used to compute `accountState` so a half-provisioned driver SHOWS the discrepancy (FR-006). */
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

/** Disable the identity account — defence in depth. The record check already refuses a non-active
 *  driver, but disabling means no session can be obtained even if that check were bypassed. */
export async function disableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: email }));
}

export async function enableDriverUser(email: string): Promise<void> {
  await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: email }));
}
