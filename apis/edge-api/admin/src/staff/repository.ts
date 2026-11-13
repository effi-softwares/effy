import { pooled, query } from "@effy/edge-shared";
import { readMemberBySub, touchLastSeen as touchLastSeenWrite } from "@effy/edge-shared/team";
import type { TeamMemberDTO } from "@effy/shared-types";

/**
 * 119 (research R1): a sign-in never writes the team. The record is read by the token's subject; the only write is
 * when an ACTIVE person was last seen, through the team's one writer. No record → no access.
 */
export async function readBySub(sub: string): Promise<TeamMemberDTO | null> {
  return readMemberBySub(pooled, sub);
}

export async function touchLastSeen(sub: string): Promise<void> {
  await touchLastSeenWrite(pooled, sub);
}

// Active and holds the admin role; a disabled row is denied even with a valid admin token.
export async function authorizeAdmin(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1 AND s.status = 'active' AND sr.role_key = 'admin'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}
