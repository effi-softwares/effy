/**
 * Establishing — and removing — a back-office administrator out-of-band (spec 006).
 *
 * Two systems hold an admin: the identity provider (so the person can sign in) and the platform's
 * own staff record (so they are authorized). There is no transaction across the two, so they are
 * kept consistent by ORDER and IDEMPOTENCE: the identity provider first (it issues the stable
 * subject the record is keyed on), then the record; every step is safe to repeat, so a run that
 * dies halfway is repaired by running it again.
 */
import {
  AdminAddUserToGroupCommand, AdminCreateUserCommand, AdminDeleteUserCommand, AdminEnableUserCommand, AdminGetUserCommand,
  type AttributeType, type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import type pg from "pg";

/** The back-office super-admin role and group (full administrative access). */
export const ROLE_ADMIN = "admin";

/** Refusing to remove the last active administrator. */
export class LastAdminError extends Error {
  constructor() {
    super("refusing to delete the last active administrator (pass --force to override)");
  }
}

/** A deliberately plain check: one address, something@something.tld, no display-name form. */
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** ⚠ Runs BEFORE any side effect, so bad input leaves no partial state. */
export function validateInput(email: string, name: string): void {
  if (name.trim() === "") throw new Error("name is required");
  if (!EMAIL.test(email)) throw new Error(`invalid email "${email}"`);
}

export interface IdentityProvider {
  ensureAdmin(email: string, name: string): Promise<{ sub: string; outcome: "created" | "already-exists" }>;
  resolveAdmin(email: string): Promise<{ sub: string; username: string } | null>;
  /** False when the user was already gone. */
  deleteAdmin(username: string): Promise<boolean>;
}

export interface StaffRecords {
  upsertSuperAdmin(sub: string, email: string, name: string): Promise<"created" | "updated">;
  isLastActiveAdmin(sub: string): Promise<boolean>;
  deleteAdmin(sub: string, email: string): Promise<"deleted" | "not-found">;
}

const named = (err: unknown, name: string) => (err as { name?: string } | null)?.name === name;
const subOf = (attrs: AttributeType[] | undefined) => attrs?.find((a) => a.Name === "sub")?.Value ?? "";

export function cognitoIdentityProvider(client: Pick<CognitoIdentityProviderClient, "send">, poolId: string): IdentityProvider {
  return {
    /**
     * Create a PASSWORDLESS, CONFIRMED user and put them in the admin group.
     *
     * ⚠ No temporary password: that is what lands the user confirmed on a passwordless pool, able
     * to sign in with a one-time code at once. ⚠ The invitation is SUPPRESSED — the operator tells
     * the person themselves; the platform sends nothing to an address on the strength of this tool.
     * On a re-run an existing user is reconciled (re-enabled if disabled), never duplicated.
     */
    async ensureAdmin(email, name) {
      let username: string;
      let sub: string;
      let outcome: "created" | "already-exists";
      try {
        const created = await client.send(new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: email, // the pool signs in by email; the provider assigns the real username
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "name", Value: name },
          ],
        }));
        outcome = "created";
        username = created.User?.Username ?? "";
        sub = subOf(created.User?.Attributes);
      } catch (err) {
        if (!named(err, "UsernameExistsException")) throw new Error(`AdminCreateUser: ${(err as Error).message}`);
        outcome = "already-exists";
        const got = await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }));
        username = got.Username ?? "";
        sub = subOf(got.UserAttributes);
        if (!got.Enabled) await client.send(new AdminEnableUserCommand({ UserPoolId: poolId, Username: username }));
      }
      if (sub === "") throw new Error("cognito: no sub attribute in response");
      // Adding an existing member is a no-op.
      await client.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: username, GroupName: ROLE_ADMIN }));
      return { sub, outcome };
    },

    async resolveAdmin(email) {
      try {
        const got = await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }));
        return { sub: subOf(got.UserAttributes), username: got.Username ?? "" };
      } catch (err) {
        if (named(err, "UserNotFoundException")) return null;
        throw new Error(`AdminGetUser: ${(err as Error).message}`);
      }
    },

    async deleteAdmin(username) {
      try {
        await client.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: username }));
        return true;
      } catch (err) {
        if (named(err, "UserNotFoundException")) return false;
        throw new Error(`AdminDeleteUser: ${(err as Error).message}`);
      }
    },
  };
}

export function staffRecords(db: Pick<pg.Client, "query">): StaffRecords {
  return {
    /**
     * An active staff row keyed on the subject, plus the admin role, in ONE transaction. A re-run
     * refreshes email and name and restores a disabled row to active (this is the break-glass).
     */
    async upsertSuperAdmin(sub, email, name) {
      await db.query("BEGIN");
      try {
        let outcome: "created" | "updated" = "created";
        let id = (
          await db.query<{ id: string }>(
            `INSERT INTO admin.staff (cognito_sub, email, name, status) VALUES ($1, $2, $3, 'active')
             ON CONFLICT (cognito_sub) DO NOTHING RETURNING id::text AS id`,
            [sub, email, name],
          )
        ).rows[0]?.id;
        if (!id) {
          outcome = "updated";
          id = (
            await db.query<{ id: string }>(
              `UPDATE admin.staff SET email = $2, name = $3, status = 'active', updated_at = now()
                WHERE cognito_sub = $1 RETURNING id::text AS id`,
              [sub, email, name],
            )
          ).rows[0]?.id;
        }
        if (!id) throw new Error("upsert admin.staff returned no row");
        await db.query(`INSERT INTO admin.staff_role (staff_id, role_key) VALUES ($1::uuid, 'admin') ON CONFLICT DO NOTHING`, [id]);
        await db.query("COMMIT");
        return outcome;
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    },

    /** This subject is an active admin AND no OTHER active admin exists. */
    async isLastActiveAdmin(sub) {
      return (
        (
          await db.query<{ last: boolean }>(
            `SELECT
                 EXISTS (SELECT 1 FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
                          WHERE s.cognito_sub = $1 AND r.role_key = 'admin' AND s.status = 'active')
             AND NOT EXISTS (SELECT 1 FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
                          WHERE s.cognito_sub <> $1 AND r.role_key = 'admin' AND s.status = 'active') AS last`,
            [sub],
          )
        ).rows[0]?.last === true
      );
    },

    /** By subject; by email when the subject is unknown (the identity is already gone). */
    async deleteAdmin(sub, email) {
      const res = sub !== ""
        ? await db.query(`DELETE FROM admin.staff WHERE cognito_sub = $1`, [sub])
        : await db.query(`DELETE FROM admin.staff WHERE email = $1`, [email]);
      return (res.rowCount ?? 0) > 0 ? "deleted" : "not-found";
    },
  };
}

export interface BootstrapResult {
  email: string;
  sub: string;
  cognito: "created" | "already-exists";
  group: string;
  staff: "created" | "updated";
  role: string;
}

export async function createFirstAdmin(idp: IdentityProvider, records: StaffRecords, email: string, name: string): Promise<BootstrapResult> {
  validateInput(email, name);
  const { sub, outcome } = await idp.ensureAdmin(email, name);
  const staff = await records.upsertSuperAdmin(sub, email, name);
  return { email, sub, cognito: outcome, group: ROLE_ADMIN, staff, role: ROLE_ADMIN };
}

export interface DeleteResult {
  email: string;
  sub: string;
  cognito: "deleted" | "not-found";
  staff: "deleted" | "not-found";
}

/**
 * Remove an admin from BOTH systems. Safe to re-run: what is already gone reports "not-found".
 * ⚠ Refuses the last active administrator unless forced — that would leave nobody able to sign in
 * to the back office, recoverable only by this tool's other half.
 */
export async function deleteAdmin(idp: IdentityProvider, records: StaffRecords, email: string, force: boolean): Promise<DeleteResult> {
  if (!EMAIL.test(email)) throw new Error(`invalid email "${email}"`);
  const found = await idp.resolveAdmin(email);
  let cognito: DeleteResult["cognito"] = "not-found";
  if (found) {
    if (!force && found.sub !== "" && (await records.isLastActiveAdmin(found.sub))) throw new LastAdminError();
    if (await idp.deleteAdmin(found.username)) cognito = "deleted";
  }
  const sub = found?.sub ?? "";
  return { email, sub, cognito, staff: await records.deleteAdmin(sub, email) };
}
