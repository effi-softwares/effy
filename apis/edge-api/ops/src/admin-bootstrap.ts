/**
 * The break-glass way to add or remove a back-office Administrator (FR-034): the first one, or when every
 * Administrator is locked out. It writes the SAME team record and the same record of changes as Settings › Team and
 * access - through @effy/edge-shared/team's one writer, signed "Operator" - and follows the same rules, except that
 * `--force` may delete the last active Administrator (audited as forced).
 *
 * Cognito and the record share no transaction, so the pool account is made first (it issues the subject), the record
 * second, the group third; every step is safe to repeat.
 */
import pg from "pg";

import type { Queryable, Transactor } from "@effy/edge-shared";
import {
  OPERATOR,
  TeamRefusalError,
  addMember,
  changeRole,
  recordSignInStep,
  removeMember,
  setStatus,
  signInHandle,
  validEmail,
  type SignInPort,
} from "@effy/edge-shared/team";

/** The team's one email rule (any domain, compared lower-cased), said the way the tool always said it. */
function checkedEmail(raw: string): string {
  try {
    return validEmail(raw);
  } catch {
    throw new Error(`invalid email "${raw}"`);
  }
}

export const ROLE_ADMIN = "admin";

export class LastAdminError extends Error {
  constructor() {
    super("refusing to delete the last active administrator (pass --force to override)");
  }
}

/** Runs before any side effect. */
export function validateInput(email: string, name: string): void {
  if (name.trim() === "") throw new Error("name is required");
  if (email !== email.trim()) throw new Error(`invalid email "${email}"`);
  checkedEmail(email);
}

/** BEGIN / COMMIT on the tool's one connection. */
export function clientTransactor(db: Pick<pg.Client, "query">): Transactor {
  return async (fn) => {
    await db.query("BEGIN");
    try {
      const out = await fn(db as unknown as Queryable);
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  };
}

const noMetric = { metric: () => undefined };

interface Found {
  id: string;
  status: "active" | "disabled" | "removed";
  role: string | null;
}

async function recordOf(transact: Transactor, email: string, sub: string | null): Promise<Found | null> {
  return transact(async (tx) => {
    const res = await tx.query<Found>(
      `SELECT s.id::text AS id, s.status, sr.role_key AS role
         FROM admin.staff s LEFT JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.email = $1 OR ($2::text IS NOT NULL AND s.cognito_sub = $2)
        ORDER BY (s.email = $1) DESC LIMIT 1`,
      [email, sub],
    );
    return res.rows[0] ?? null;
  });
}

export interface BootstrapResult {
  email: string;
  sub: string;
  cognito: "created" | "already-exists";
  group: string;
  staff: "created" | "updated";
  role: string;
}

export async function createFirstAdmin(port: SignInPort, transact: Transactor, rawEmail: string, name: string): Promise<BootstrapResult> {
  validateInput(rawEmail.trim(), name);
  const email = checkedEmail(rawEmail);
  const account = await port.create(email, name.trim());
  if (!account.enabled) await port.enable(account.username);

  const found = await recordOf(transact, email, account.sub);
  let staffId: string;
  let staff: BootstrapResult["staff"] = "updated";
  if (!found || found.status === "removed") {
    staffId = (
      await transact((tx) => addMember(tx, OPERATOR, { email, name, role: "admin", sub: account.sub, adopted: account.adopted, invite: false }))
    ).staffId;
    staff = found ? "updated" : "created";
  } else {
    staffId = found.id;
    if (found.status === "disabled") await transact((tx) => setStatus(tx, OPERATOR, staffId, "active", { role: "admin" }));
    await transact((tx) => changeRole(tx, OPERATOR, staffId, "admin"));
  }

  let groupError: unknown = null;
  try {
    await port.setGroup(account.username, "admin");
  } catch (err) {
    groupError = err;
  }
  await transact((tx) => recordSignInStep(tx, OPERATOR, staffId, "group", groupError, noMetric));
  if (groupError) throw groupError;
  return { email, sub: account.sub, cognito: account.adopted ? "already-exists" : "created", group: ROLE_ADMIN, staff, role: ROLE_ADMIN };
}

export interface DeleteResult {
  email: string;
  sub: string;
  cognito: "deleted" | "not-found";
  staff: "removed" | "not-found";
}

/**
 * Disables (if active) and removes the record - KEPT, so the person's name stays on what they did - then deletes the
 * sign-in account. Safe to re-run. Refuses the last active administrator unless forced.
 */
export async function deleteAdmin(port: SignInPort, transact: Transactor, rawEmail: string, force: boolean): Promise<DeleteResult> {
  const email = checkedEmail(rawEmail);
  const account = await port.get(email);
  const found = await recordOf(transact, email, account?.sub ?? null);

  let staff: DeleteResult["staff"] = "not-found";
  if (found && found.status !== "removed") {
    try {
      if (found.status === "active") await transact((tx) => setStatus(tx, OPERATOR, found.id, "disabled", { force }));
      await transact((tx) => removeMember(tx, OPERATOR, found.id));
    } catch (err) {
      if (err instanceof TeamRefusalError && err.type === "last_admin") throw new LastAdminError();
      throw err;
    }
    staff = "removed";
  } else if (found) {
    staff = "removed";
  }

  let cognito: DeleteResult["cognito"] = "not-found";
  if (account) {
    if (await port.delete(account.username)) cognito = "deleted";
  } else if (found) {
    if (await port.delete(signInHandle({ email }))) cognito = "deleted";
  }
  if (found) await transact((tx) => recordSignInStep(tx, OPERATOR, found.id, "delete", null, noMetric));
  return { email, sub: account?.sub ?? "", cognito, staff };
}
