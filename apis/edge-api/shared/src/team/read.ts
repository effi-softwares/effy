// Reading a team member: one SELECT and one mapping, shared by the person page, the list and every write's answer.
import type pg from "pg";

import {
  BACK_OFFICE_ROLES,
  type BackOfficeRole,
  type InvitationDelivery,
  type SignInIssue,
  type TeamMemberDetailDTO,
  type TeamMemberDTO,
  type TeamStatus,
} from "@effy/shared-types";

import { staffNameSql } from "../lib/activity";
import type { Queryable } from "../lib/db";
import { actionsFor } from "./rules";

export interface MemberRow extends pg.QueryResultRow {
  id: string;
  cognito_sub: string;
  name: string | null;
  email: string;
  status: TeamStatus;
  revision: number;
  role_key: string | null;
  last_seen_at: Date | null;
  created_at: Date;
  added_by_name: string | null;
  disabled_at: Date | null;
  disabled_by_name: string | null;
  removed_at: Date | null;
  removed_by_name: string | null;
  invited_at: Date | null;
  invitation_message_id: string | null;
  invitation_delivery: "delivered" | "bounced" | "complained" | null;
  sign_in_issue: SignInIssue | null;
}

/** The columns of a member. `s` is `admin.staff`, `sr` its one `admin.staff_role` (LEFT JOIN). */
export const MEMBER_COLUMNS = `
  s.id::text AS id, s.cognito_sub, s.name, s.email::text AS email, s.status, s.revision, sr.role_key,
  s.last_seen_at, s.created_at,
  CASE WHEN s.added_by_sub IS NULL THEN NULL ELSE ${staffNameSql("s.added_by_sub")} END AS added_by_name,
  s.disabled_at, ${staffNameSql("s.disabled_by_sub")} AS disabled_by_name,
  s.removed_at, ${staffNameSql("s.removed_by_sub")} AS removed_by_name,
  s.invited_at, s.invitation_message_id,
  (SELECT CASE WHEN bool_or(e.event_type IN ('bounce', 'reject')) THEN 'bounced'
               WHEN bool_or(e.event_type = 'complaint') THEN 'complained'
               WHEN bool_or(e.event_type = 'delivery') THEN 'delivered' END
     FROM public.email_delivery_event e
    WHERE e.message_id = s.invitation_message_id) AS invitation_delivery,
  s.sign_in_issue`;

export const MEMBER_FROM = `admin.staff s LEFT JOIN admin.staff_role sr ON sr.staff_id = s.id`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path id that cannot be a member is "not there", not a database error. */
export function isMemberId(id: string): boolean {
  return UUID.test(id);
}

function role(key: string | null): BackOfficeRole | null {
  return key && (BACK_OFFICE_ROLES as readonly string[]).includes(key) ? (key as BackOfficeRole) : null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function delivery(row: MemberRow): InvitationDelivery {
  if (row.invitation_message_id === null) return "failed";
  return row.invitation_delivery ?? "sent";
}

export function mapMember(row: MemberRow): TeamMemberDTO {
  return {
    id: row.id,
    subject: row.cognito_sub,
    name: row.name,
    email: row.email,
    role: role(row.role_key),
    status: row.status,
    lastSeenAt: iso(row.last_seen_at),
    addedAt: row.created_at.toISOString(),
    addedBy: row.added_by_name ? { name: row.added_by_name } : null,
    invitation: row.invited_at ? { sentAt: row.invited_at.toISOString(), delivery: delivery(row) } : null,
    signInIssue: row.sign_in_issue,
    revision: row.revision,
  };
}

export function mapMemberDetail(row: MemberRow, callerSub: string): TeamMemberDetailDTO {
  const member = mapMember(row);
  return {
    ...member,
    disabledAt: iso(row.disabled_at),
    disabledBy: row.disabled_at && row.disabled_by_name ? { name: row.disabled_by_name } : null,
    removedAt: iso(row.removed_at),
    removedBy: row.removed_at && row.removed_by_name ? { name: row.removed_by_name } : null,
    isYou: row.cognito_sub === callerSub,
    actions: actionsFor(member, callerSub),
  };
}

/** One member as their page shows them to `callerSub`; null when there is none. */
export async function readMember(tx: Queryable, staffId: string, callerSub: string): Promise<TeamMemberDetailDTO | null> {
  if (!isMemberId(staffId)) return null;
  const res = await tx.query<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM ${MEMBER_FROM} WHERE s.id = $1`, [staffId]);
  const row = res.rows[0];
  return row ? mapMemberDetail(row, callerSub) : null;
}

/** The record behind a token: who they are, whatever their status; null when the account has none (R1). */
export async function readMemberBySub(tx: Queryable, sub: string): Promise<TeamMemberDTO | null> {
  const res = await tx.query<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM ${MEMBER_FROM} WHERE s.cognito_sub = $1`, [sub]);
  const row = res.rows[0];
  return row ? mapMember(row) : null;
}

/** Every other active Administrator's email and name (FR-016). */
export async function otherActiveAdmins(tx: Queryable, exceptStaffId: string): Promise<{ email: string; name: string | null }[]> {
  const res = await tx.query<{ email: string; name: string | null }>(
    `SELECT s.email::text AS email, s.name
       FROM admin.staff s JOIN admin.staff_role sr ON sr.staff_id = s.id
      WHERE s.status = 'active' AND sr.role_key = 'admin' AND s.id <> $1 AND position('@' IN s.email) > 0
      ORDER BY s.id`,
    [exceptStaffId],
  );
  return res.rows;
}

/** The name a person's actions are signed with: their record's, "Operator", or "Effy". */
export async function actorName(tx: Queryable, sub: string): Promise<string> {
  const res = await tx.query<{ name: string }>(`SELECT ${staffNameSql("$1::text")} AS name`, [sub]);
  return res.rows[0]?.name ?? "Former staff";
}
