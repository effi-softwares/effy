// THE ONE WRITER of the back-office team (research R12): `admin.staff`, `admin.staff_role`, `admin.staff_former_subject`,
// `admin.sign_in_orphan`, `admin.team_check` and the `team.*` rows of `admin.audit_log`. The admin-team routes and the
// operator tool (`ops`) both write through here; team.guard.test.ts fails a write anywhere else.
//
// Every function runs inside the caller's transaction (`tx`) and takes the team lock first (R7), so two
// administrators changing the team at once are serialised and the last-administrator rule cannot be raced.
// The sign-in pool is NOT called here: the service changes the record, commits, then mirrors it (R5) and reports the
// outcome with `recordSignInStep`.
import {
  TEAM_EMAIL_SHAPE,
  TEAM_NAME_MAX,
  normaliseTeamEmail,
  type BackOfficeRole,
  type SignInIssue,
  type TeamAction,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { emitMetric } from "../lib/metrics";
import { TeamNotFoundError, TeamRefusalError, TeamValidationError } from "./errors";
import { isMemberId, MEMBER_COLUMNS, MEMBER_FROM, mapMember, type MemberRow } from "./read";
import { refusalFor } from "./rules";
import type { SignInAccount } from "./sign-in";

/** Who is changing the team: a staff subject, `operator` (the break-glass tool), or `system:<feature>`. */
export interface Actor {
  sub: string;
}

export const OPERATOR: Actor = { sub: "operator" };

export const TEAM_METRIC_NAMESPACE = "Effy/Team";

const INVITE_GAP_MINUTES = 5;

// ── Rules every write shares ───────────────────────────────────────────────────────────────────────────────────────

/** Serialises every team write (one lock: team writes are rare). Held until the transaction ends. */
export async function withTeamLock(tx: Queryable): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext('admin.team'))`);
}

async function loadLocked(tx: Queryable, staffId: string): Promise<MemberRow> {
  if (!isMemberId(staffId)) throw new TeamNotFoundError(staffId);
  const res = await tx.query<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM ${MEMBER_FROM} WHERE s.id = $1 FOR UPDATE OF s`,
    [staffId],
  );
  const row = res.rows[0];
  if (!row) throw new TeamNotFoundError(staffId);
  return row;
}

/** A change made against an out-of-date view is refused (FR-024). `undefined` = the caller did not name one. */
export function assertRevision(row: { revision: number }, expected: number | undefined): void {
  if (expected !== undefined && row.revision !== expected) throw new TeamRefusalError("staff_changed");
}

function assertAllowed(action: TeamAction, row: MemberRow, actor: Actor): void {
  const refusal = refusalFor(action, mapMember(row), actor.sub);
  if (refusal) throw new TeamRefusalError(refusal);
}

/** There must always be an active Administrator (FR-022). Call under the lock, before taking `staffId`'s away. */
export async function assertAdminsRemain(tx: Queryable, staffId: string): Promise<void> {
  const res = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM admin.staff s JOIN admin.staff_role sr ON sr.staff_id = s.id
      WHERE s.status = 'active' AND sr.role_key = 'admin' AND s.id <> $1`,
    [staffId],
  );
  if ((res.rows[0]?.n ?? 0) === 0) throw new TeamRefusalError("last_admin");
}

/** Appended, never edited (FR-025). `staffId` null for an account with no record. */
export async function audit(
  tx: Queryable,
  actor: Actor,
  action: `team.${string}`,
  staffId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'staff', $3, $4::jsonb)`,
    [actor.sub, action, staffId, JSON.stringify(detail)],
  );
}

/** 1–120 characters after trimming (data-model.md). */
export function validName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name === "") throw new TeamValidationError("name", "Enter their full name.");
  if (name.length > TEAM_NAME_MAX) throw new TeamValidationError("name", `A name is at most ${TEAM_NAME_MAX} characters.`);
  return name;
}

/** Any domain; compared ignoring case and surrounding spaces (FR-009). */
export function validEmail(raw: unknown): string {
  const email = typeof raw === "string" ? normaliseTeamEmail(raw) : "";
  if (!TEAM_EMAIL_SHAPE.test(email) || email.length > 254) throw new TeamValidationError("email", "Enter an email address.");
  return email;
}

export function validRole(raw: unknown): BackOfficeRole {
  if (raw === "admin" || raw === "manager" || raw === "csa") return raw;
  throw new TeamValidationError("role", "Choose a role.");
}

async function setRole(tx: Queryable, staffId: string, role: BackOfficeRole): Promise<void> {
  await tx.query(`DELETE FROM admin.staff_role WHERE staff_id = $1`, [staffId]);
  await tx.query(`INSERT INTO admin.staff_role (staff_id, role_key) VALUES ($1, $2)`, [staffId, role]);
}

// ── Add (US1) ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AddInput {
  email: string;
  name: string;
  role: BackOfficeRole;
  /** The sign-in account's subject (created, or adopted, before this transaction - R5). */
  sub: string;
  /** The account existed already (an account with no record, or a half-done add). */
  adopted: boolean;
  invite: boolean;
}

export interface AddOutcome {
  staffId: string;
  readded: boolean;
}

/** The email's record, if any - the add route asks before it touches the pool. */
export async function findByEmail(
  tx: Queryable,
  rawEmail: string,
): Promise<{ id: string; status: MemberRow["status"] } | null> {
  const res = await tx.query<{ id: string; status: MemberRow["status"] }>(
    `SELECT id::text AS id, status FROM admin.staff WHERE email = $1`,
    [normaliseTeamEmail(rawEmail)],
  );
  return res.rows[0] ?? null;
}

function refuseExisting(existing: { id: string; status: MemberRow["status"] }): void {
  if (existing.status === "active") throw new TeamRefusalError("already_on_team", { memberId: existing.id });
  if (existing.status === "disabled") throw new TeamRefusalError("disabled_on_team", { memberId: existing.id });
}

/**
 * Adds a person, or brings a removed one back as the same record (FR-010): the old subject is kept in
 * `staff_former_subject`, so their earlier actions still carry their name.
 */
export async function addMember(tx: Queryable, actor: Actor, input: AddInput): Promise<AddOutcome> {
  const email = validEmail(input.email);
  const name = validName(input.name);
  const role = validRole(input.role);
  await withTeamLock(tx);

  const byEmail = await tx.query<{ id: string; status: MemberRow["status"]; cognito_sub: string }>(
    `SELECT id::text AS id, status, cognito_sub FROM admin.staff WHERE email = $1 FOR UPDATE`,
    [email],
  );
  const bySub = await tx.query<{ id: string; status: MemberRow["status"]; cognito_sub: string }>(
    `SELECT id::text AS id, status, cognito_sub FROM admin.staff WHERE cognito_sub = $1 FOR UPDATE`,
    [input.sub],
  );
  const existing = byEmail.rows[0] ?? bySub.rows[0];

  let staffId: string;
  let readded = false;
  if (existing) {
    refuseExisting(existing);
    // Removed: the same person comes back.
    readded = true;
    staffId = existing.id;
    if (existing.cognito_sub !== input.sub) {
      await tx.query(
        `INSERT INTO admin.staff_former_subject (cognito_sub, staff_id, until) VALUES ($1, $2, now())
         ON CONFLICT (cognito_sub) DO NOTHING`,
        [existing.cognito_sub, staffId],
      );
    }
    await tx.query(`DELETE FROM admin.staff_former_subject WHERE cognito_sub = $1`, [input.sub]);
    await tx.query(
      `UPDATE admin.staff
          SET cognito_sub = $2, email = $3, name = $4, status = 'active',
              removed_at = NULL, removed_by_sub = NULL, disabled_at = NULL, disabled_by_sub = NULL,
              sign_in_issue = NULL, sign_in_checked_at = now(), revision = revision + 1, updated_at = now()
        WHERE id = $1`,
      [staffId, input.sub, email, name],
    );
    await setRole(tx, staffId, role);
    await audit(tx, actor, "team.readded", staffId, { role, formerSub: existing.cognito_sub, invited: input.invite });
  } else {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO admin.staff (cognito_sub, email, name, status, added_by_sub, sign_in_checked_at)
       VALUES ($1, $2, $3, 'active', $4, now())
       RETURNING id::text AS id`,
      [input.sub, email, name, actor.sub],
    );
    staffId = inserted.rows[0]!.id;
    await setRole(tx, staffId, role);
    await audit(tx, actor, "team.added", staffId, { role, invited: input.invite, adopted: input.adopted });
  }
  await tx.query(`DELETE FROM admin.sign_in_orphan WHERE cognito_sub = $1`, [input.sub]);
  return { staffId, readded };
}

// ── Disable / re-enable (US2) ──────────────────────────────────────────────────────────────────────────────────────

export interface StatusOptions {
  expectedRevision?: number;
  /** Re-enabling a person with no role needs one (FR-035). */
  role?: BackOfficeRole;
  /** Break-glass only (`make delete-admin FORCE=1`): skip the last-administrator rule. Audited. */
  force?: boolean;
}

export interface StatusOutcome {
  role: BackOfficeRole | null;
  changed: boolean;
}

export async function setStatus(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  to: "active" | "disabled",
  options: StatusOptions = {},
): Promise<StatusOutcome> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertRevision(row, options.expectedRevision);
  const current = mapMember(row);

  if (to === "disabled") {
    assertAllowed("disable", row, actor);
    if (current.role === "admin" && !options.force) await assertAdminsRemain(tx, staffId);
    await tx.query(
      `UPDATE admin.staff SET status = 'disabled', disabled_at = now(), disabled_by_sub = $2,
              revision = revision + 1, updated_at = now()
        WHERE id = $1`,
      [staffId, actor.sub],
    );
    await audit(tx, actor, "team.disabled", staffId, options.force ? { forced: true } : {});
    return { role: current.role, changed: true };
  }

  assertAllowed("enable", row, actor);
  const role = current.role ?? (options.role ? validRole(options.role) : null);
  if (!role) throw new TeamRefusalError("role_required");
  if (current.role === null) await setRole(tx, staffId, role);
  await tx.query(
    `UPDATE admin.staff SET status = 'active', disabled_at = NULL, disabled_by_sub = NULL,
            sign_in_issue = CASE WHEN sign_in_issue = 'no_role' THEN NULL ELSE sign_in_issue END,
            revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [staffId],
  );
  await audit(tx, actor, "team.enabled", staffId, { role });
  return { role, changed: true };
}

// ── Change role (US3) ──────────────────────────────────────────────────────────────────────────────────────────────

export interface RoleOutcome {
  from: BackOfficeRole | null;
  to: BackOfficeRole;
  changed: boolean;
}

export async function changeRole(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  rawRole: BackOfficeRole,
  expectedRevision?: number,
): Promise<RoleOutcome> {
  const to = validRole(rawRole);
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertRevision(row, expectedRevision);
  assertAllowed("role", row, actor);
  const from = mapMember(row).role;
  if (from === to) return { from, to, changed: false };
  if (from === "admin") await assertAdminsRemain(tx, staffId);

  await setRole(tx, staffId, to);
  await tx.query(`UPDATE admin.staff SET revision = revision + 1, updated_at = now() WHERE id = $1`, [staffId]);
  await audit(tx, actor, "team.role_changed", staffId, { from, to });
  return { from, to, changed: true };
}

// ── Remove (US5) ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Disabled people only (FR-019). The record and its role are KEPT: their name stays on everything they did. */
export async function removeMember(tx: Queryable, actor: Actor, staffId: string, expectedRevision?: number): Promise<void> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertRevision(row, expectedRevision);
  assertAllowed("remove", row, actor);
  await tx.query(
    `UPDATE admin.staff SET status = 'removed', removed_at = now(), removed_by_sub = $2,
            revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [staffId, actor.sub],
  );
  await audit(tx, actor, "team.removed", staffId);
}

// ── Invitation and sign out everywhere (US6) ───────────────────────────────────────────────────────────────────────

/**
 * Claims the right to send an invitation now: refused within five minutes of the last (FR-013). `invited_at` is set
 * under the lock, so two presses at once send one email. `recordInvitation` notes the outcome after the send.
 */
export async function claimInvitation(
  tx: Queryable,
  actor: Actor,
  staffId: string,
): Promise<{ email: string; role: BackOfficeRole }> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertAllowed("invite", row, actor);
  const recent = await tx.query<{ recent: boolean }>(
    `SELECT invited_at IS NOT NULL AND invited_at > now() - make_interval(mins => $2) AS recent
       FROM admin.staff WHERE id = $1`,
    [staffId, INVITE_GAP_MINUTES],
  );
  if (recent.rows[0]?.recent) throw new TeamRefusalError("invited_recently");
  const role = mapMember(row).role;
  if (!role) throw new TeamRefusalError("not_active");
  await tx.query(`UPDATE admin.staff SET invited_at = now(), invitation_message_id = NULL WHERE id = $1`, [staffId]);
  return { email: row.email, role };
}

/** After the send: its mail id (delivery is read by it, FR-014), or null when the send failed. */
export async function recordInvitation(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  messageId: string | null,
): Promise<void> {
  await tx.query(`UPDATE admin.staff SET invitation_message_id = $2 WHERE id = $1`, [staffId, messageId]);
  await audit(tx, actor, "team.invited", staffId, messageId ? { messageId } : { failed: true });
}

/** Recorded BEFORE the pool call (R5): the record says it was asked even if the pool then fails. */
export async function noteSignedOut(tx: Queryable, actor: Actor, staffId: string): Promise<{ email: string }> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertAllowed("sign_out", row, actor);
  await audit(tx, actor, "team.signed_out", staffId);
  return { email: row.email };
}

// ── Rename (US8) ───────────────────────────────────────────────────────────────────────────────────────────────────

export async function renameMember(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  rawName: string,
  expectedRevision?: number,
): Promise<{ changed: boolean }> {
  const name = validName(rawName);
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertRevision(row, expectedRevision);
  if (row.name === name) return { changed: false };
  await tx.query(`UPDATE admin.staff SET name = $2, revision = revision + 1, updated_at = now() WHERE id = $1`, [
    staffId,
    name,
  ]);
  await audit(tx, actor, "team.renamed", staffId, { from: row.name, to: name });
  return { changed: true };
}

// ── The sign-in account's half of a change (R5) ────────────────────────────────────────────────────────────────────

/** The pool call a change makes after its commit, and what disagrees if it fails. */
export type SignInStep = "create" | "group" | "enable" | "disable" | "sign_out" | "delete";

const ISSUE_WHEN_FAILED: Readonly<Record<SignInStep, SignInIssue>> = {
  create: "missing",
  group: "group_differs",
  enable: "disabled_while_on",
  disable: "enabled_while_off",
  sign_out: "enabled_while_off",
  delete: "enabled_while_off",
};

export interface StepDeps {
  /** The metric; the operator tool passes a no-op (its stdout is its JSON answer). */
  metric?: (step: SignInStep) => void;
}

const defaultMetric = (_step: SignInStep) => emitMetric(TEAM_METRIC_NAMESPACE, "TeamSignInStepFailures", 1, {});

/**
 * Writes the outcome of a pool step: in step (the issue clears; `email_differs` and `no_role` need Repair or
 * re-enable), or Needs attention with `team.sign_in_failed` and the alarmed metric (FR-032). Returns ok.
 */
export async function recordSignInStep(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  step: SignInStep,
  error: unknown | null,
  deps: StepDeps = {},
): Promise<boolean> {
  if (error === null) {
    await tx.query(
      `UPDATE admin.staff
          SET sign_in_issue = CASE WHEN sign_in_issue IN ('email_differs', 'no_role') THEN sign_in_issue ELSE NULL END,
              sign_in_checked_at = now()
        WHERE id = $1`,
      [staffId],
    );
    return true;
  }
  await tx.query(`UPDATE admin.staff SET sign_in_issue = $2, sign_in_checked_at = now() WHERE id = $1`, [
    staffId,
    ISSUE_WHEN_FAILED[step],
  ]);
  const message = error instanceof Error ? error.message : String(error);
  await audit(tx, actor, "team.sign_in_failed", staffId, { step, error: message.slice(0, 300) });
  (deps.metric ?? defaultMetric)(step);
  return false;
}

// ── Repair (US7) ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Before Repair calls the pool: the revision and the rules, under the lock. Returns the record as it stands. */
export async function beginRepair(
  tx: Queryable,
  actor: Actor,
  staffId: string,
  expectedRevision?: number,
): Promise<ReturnType<typeof mapMember>> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  assertRevision(row, expectedRevision);
  assertAllowed("repair", row, actor);
  return mapMember(row);
}

export interface RepairRecord {
  issue: SignInIssue | null;
  steps: string[];
  /** A new account was created (the old one was missing): its subject replaces the record's. */
  sub?: string;
  /** The account's email, copied onto an `email_differs` record. */
  email?: string;
  /** What still disagrees after the steps (null = in step). */
  after: SignInIssue | null;
}

export async function recordRepair(tx: Queryable, actor: Actor, staffId: string, repair: RepairRecord): Promise<void> {
  await withTeamLock(tx);
  const row = await loadLocked(tx, staffId);
  let bump = false;
  if (repair.sub && repair.sub !== row.cognito_sub) {
    await tx.query(
      `INSERT INTO admin.staff_former_subject (cognito_sub, staff_id, until) VALUES ($1, $2, now())
       ON CONFLICT (cognito_sub) DO NOTHING`,
      [row.cognito_sub, staffId],
    );
    await tx.query(`UPDATE admin.staff SET cognito_sub = $2 WHERE id = $1`, [staffId, repair.sub]);
    await tx.query(`DELETE FROM admin.sign_in_orphan WHERE cognito_sub = $1`, [repair.sub]);
    bump = true;
  }
  if (repair.email && repair.email !== row.email) {
    const taken = await tx.query(`SELECT 1 FROM admin.staff WHERE email = $1 AND id <> $2`, [repair.email, staffId]);
    if (taken.rowCount === 0) {
      await tx.query(`UPDATE admin.staff SET email = $2 WHERE id = $1`, [staffId, repair.email]);
      bump = true;
    }
  }
  await tx.query(
    `UPDATE admin.staff SET sign_in_issue = $2, sign_in_checked_at = now(),
            revision = revision + CASE WHEN $3 THEN 1 ELSE 0 END, updated_at = now()
      WHERE id = $1`,
    [staffId, repair.after, bump],
  );
  await audit(tx, actor, "team.repaired", staffId, { issue: repair.issue, steps: repair.steps });
}

// ── Accounts with no record (US7) ──────────────────────────────────────────────────────────────────────────────────

export interface OrphanRow {
  username: string;
  sub: string;
  email: string | null;
}

/** Before deleting a sign-in account: it must be one with no record (`has_record` otherwise). */
export async function assertOrphan(tx: Queryable, username: string): Promise<OrphanRow> {
  const res = await tx.query<OrphanRow>(
    `SELECT cognito_username AS username, cognito_sub AS sub, email::text AS email
       FROM admin.sign_in_orphan WHERE cognito_username = $1`,
    [username],
  );
  const orphan = res.rows[0];
  if (!orphan) throw new TeamNotFoundError(username);
  const owned = await tx.query(`SELECT 1 FROM admin.staff WHERE cognito_sub = $1`, [orphan.sub]);
  if ((owned.rowCount ?? 0) > 0) throw new TeamRefusalError("has_record");
  return orphan;
}

export async function forgetOrphan(tx: Queryable, actor: Actor, orphan: OrphanRow): Promise<void> {
  await withTeamLock(tx);
  await tx.query(`DELETE FROM admin.sign_in_orphan WHERE cognito_username = $1`, [orphan.username]);
  await audit(tx, actor, "team.orphan_deleted", null, { username: orphan.username, email: orphan.email });
}

// ── The sign-in check's result (R6) ────────────────────────────────────────────────────────────────────────────────

/** Writes what the check found: every record's issue, the accounts with no record, and when it ran. */
export async function recordCheck(
  tx: Queryable,
  issues: ReadonlyMap<string, SignInIssue | null>,
  orphans: readonly SignInAccount[],
): Promise<void> {
  await withTeamLock(tx);
  const ids = [...issues.keys()];
  const values = ids.map((id) => issues.get(id) ?? null);
  if (ids.length > 0) {
    await tx.query(
      `UPDATE admin.staff s SET sign_in_issue = v.issue, sign_in_checked_at = now()
         FROM unnest($1::uuid[], $2::text[]) AS v(id, issue)
        WHERE s.id = v.id AND s.sign_in_issue IS DISTINCT FROM v.issue`,
      [ids, values],
    );
  }
  await tx.query(`DELETE FROM admin.sign_in_orphan`);
  for (const o of orphans) {
    await tx.query(
      `INSERT INTO admin.sign_in_orphan (cognito_username, cognito_sub, email, enabled, groups, created_in_pool_at, found_at)
       VALUES ($1, $2, $3, $4, $5::text[], $6, now())`,
      [o.username, o.sub, o.email, o.enabled, o.groups, o.createdAt],
    );
  }
  await tx.query(
    `INSERT INTO admin.team_check (id, checked_at) VALUES (true, now())
     ON CONFLICT (id) DO UPDATE SET checked_at = EXCLUDED.checked_at`,
  );
}

/** One record's issue after a check of that person alone (after an action, R6). */
export async function recordOneIssue(tx: Queryable, staffId: string, issue: SignInIssue | null): Promise<void> {
  await tx.query(`UPDATE admin.staff SET sign_in_issue = $2, sign_in_checked_at = now() WHERE id = $1`, [staffId, issue]);
}

// ── /me (R1) ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The ONLY thing a sign-in writes: when an ACTIVE person was last seen. It never creates a record or a role. */
export async function touchLastSeen(tx: Queryable, sub: string): Promise<void> {
  await tx.query(
    `UPDATE admin.staff SET last_seen_at = now() WHERE cognito_sub = $1 AND status = 'active'`,
    [sub],
  );
}
