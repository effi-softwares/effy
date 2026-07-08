// Service layer for the staff domain — owns the JIT-provisioning orchestration and the
// authorization decision; no HTTP, no SQL (Principle VI).
import { authorizeAdmin, upsertOnContact } from "./repository";
import type { StaffRecord } from "./types";

// Record the staff member on contact (create/refresh + role reconcile) and return their record.
export async function recordAndLoad(
  sub: string,
  email: string,
  tokenRoles: readonly string[],
): Promise<StaffRecord> {
  return upsertOnContact(sub, email, tokenRoles);
}

// Is this subject an ACTIVE administrator per the platform record? (status + role, not the claim.)
export async function isActiveAdmin(sub: string): Promise<boolean> {
  return authorizeAdmin(sub);
}
