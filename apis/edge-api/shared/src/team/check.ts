// Finding disagreements between the sign-in pool and the records (research R6). The record decides; this only says
// where the pool does not match it. Run when Team and access opens (skipped within 60 seconds of the last run), for
// one person after each change, and by Repair. There is no scheduled check.
import type { BackOfficeRole, SignInIssue, TeamStatus } from "@effy/shared-types";

import type { Queryable, Transactor } from "../lib/db";
import type { SignInAccount, SignInPort } from "./sign-in";
import { recordCheck, recordOneIssue } from "./writer";

export const CHECK_FRESH_SECONDS = 60;

export interface CheckRecord {
  id: string;
  subject: string;
  email: string;
  status: TeamStatus;
  role: BackOfficeRole | null;
}

/** What disagrees, by the record's status. Null = in step. */
export function issueFor(record: CheckRecord, account: SignInAccount | null): SignInIssue | null {
  if (record.status === "removed") return account ? "enabled_while_off" : null;
  if (record.status === "disabled") {
    if (account?.enabled) return "enabled_while_off";
    return record.role === null ? "no_role" : null;
  }
  if (!account) return "missing";
  if (!account.enabled) return "disabled_while_on";
  if (record.role === null) return "no_role";
  if (account.groups.length !== 1 || account.groups[0] !== record.role) return "group_differs";
  if (account.email !== null && account.email !== record.email) return "email_differs";
  return null;
}

/**
 * The name the pool knows a record by. Records from before 119 whose email has no "@" hold the account's
 * username (the old insert stored the token's `username`), which the pool accepts the same way.
 */
export function signInHandle(record: { email: string }): string {
  return record.email;
}

/** The account that belongs to a record: by subject, else by the username or email the record holds. */
export function accountFor(record: CheckRecord, accounts: readonly SignInAccount[]): SignInAccount | null {
  return (
    accounts.find((a) => a.sub === record.subject) ??
    accounts.find((a) => a.username === record.email) ??
    accounts.find((a) => a.email !== null && a.email === record.email) ??
    null
  );
}

const RECORDS_SQL = `
  SELECT s.id::text AS id, s.cognito_sub AS subject, s.email::text AS email, s.status, sr.role_key AS role
    FROM admin.staff s LEFT JOIN admin.staff_role sr ON sr.staff_id = s.id`;

export async function readCheckRecords(tx: Queryable, staffId?: string): Promise<CheckRecord[]> {
  const res = await tx.query<CheckRecord>(staffId ? `${RECORDS_SQL} WHERE s.id = $1` : RECORDS_SQL, staffId ? [staffId] : []);
  return res.rows;
}

export interface CheckResult {
  skipped: boolean;
  issues: number;
  orphans: number;
}

/** The whole pool against every record. `force` ignores the 60-second skip (Repair, a test). */
export async function checkSignIn(
  transact: Transactor,
  port: SignInPort,
  options: { force?: boolean } = {},
): Promise<CheckResult> {
  if (!options.force) {
    const fresh = await transact(async (tx) =>
      (
        await tx.query<{ fresh: boolean }>(
          `SELECT checked_at > now() - make_interval(secs => $1) AS fresh FROM admin.team_check`,
          [CHECK_FRESH_SECONDS],
        )
      ).rows[0]?.fresh === true,
    );
    if (fresh) return { skipped: true, issues: 0, orphans: 0 };
  }

  // The pool is read outside any transaction: it can take a few seconds, and the lock is not needed to read it.
  const accounts = await port.listAll();

  return transact(async (tx) => {
    const records = await readCheckRecords(tx);
    const issues = new Map<string, SignInIssue | null>();
    const owned = new Set<string>();
    for (const record of records) {
      const account = accountFor(record, accounts);
      if (account) owned.add(account.username);
      issues.set(record.id, issueFor(record, account));
    }
    const orphans = accounts.filter((a) => !owned.has(a.username));
    await recordCheck(tx, issues, orphans);
    return { skipped: false, issues: [...issues.values()].filter((i) => i !== null).length, orphans: orphans.length };
  });
}

/** One person's issue, after a change to them. Returns it. */
export async function checkOne(transact: Transactor, port: SignInPort, staffId: string): Promise<SignInIssue | null> {
  const [record] = await transact((tx) => readCheckRecords(tx, staffId));
  if (!record) return null;
  const account = (await port.get(signInHandle(record))) ?? (record.subject ? await port.get(record.subject) : null);
  const issue = issueFor(record, account);
  await transact((tx) => recordOneIssue(tx, staffId, issue));
  return issue;
}
