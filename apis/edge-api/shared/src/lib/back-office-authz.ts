// Back-office authorization, decided from the `admin.staff` platform record — never from the token
// claim (005 pattern; constitution Principle IV: "where the platform keeps its own record of that
// person, that record is authoritative for the access decision — a valid claim never overrides it").
//
// ⚠ PROMOTED HERE BY 053 (research R7). It was `edge-api/admin/src/feedback/authz.ts`, which was
// itself written mirroring `deliverability/authz.ts`. A THIRD consumer — the new `edge-api/orders`
// service — is what made it cross-cutting, and Principle II forbids copy-pasting cross-cutting logic
// across surfaces. The extraction is behaviour-preserving; the proof is that admin's existing
// feedback tests pass UNMODIFIED.
//
// The platform's standing split, which both consumers observe:
//
//   isActiveStaff   — read, search, detail, triage: ANY active back-office staff, INCLUDING `csa`.
//                     A CSA is exactly who fields the customer contact these consoles represent.
//   hasStaffRole    — an action whose blast radius leaves the console: an outward brand-facing email
//                     (046), a deliverability repair (037), an arrival that finishes a financial
//                     record and messages a customer (053). Active AND role ∈ the allowed set.
//
// Fail-closed: a throw propagates to the handler, which returns 503 — never an implicit allow.
import { query } from "./db";

/** Any active back-office staff member, whatever their role. The read gate. */
export async function isActiveStaff(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

/**
 * An active staff member holding at least one of `roles`. The write gate.
 *
 * ⚠ Status AND role in ONE predicate, so a disabled admin is refused by the same query that checks
 * the role — never two reads that could disagree, and never a role check that forgets the status.
 */
export async function hasStaffRole(sub: string, roles: readonly string[]): Promise<boolean> {
  if (roles.length === 0) return false;
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1
          AND s.status = 'active'
          AND sr.role_key = ANY($2::text[])
     ) AS ok`,
    [sub, roles],
  );
  return res.rows[0]?.ok ?? false;
}

/**
 * The roles allowed to take an action whose effect leaves the console.
 *
 * ⚠ `csa` is deliberately absent, and that is the platform's settled split rather than this
 * feature's opinion — 037 gates its deliverability repair this way and 046 gates its outward reply
 * this way. Named as a constant so a future consumer inherits the decision instead of re-deciding it.
 */
export const OUTWARD_ACTION_ROLES = ["admin", "manager"] as const;
