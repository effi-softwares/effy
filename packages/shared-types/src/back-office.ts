/** Back-office RBAC roles (constitution Principle IV: admin / manager / csa via cognito:groups). */
export type BackOfficeRole = "admin" | "manager" | "csa";

export const BACK_OFFICE_ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"];

/** Wire DTO for GET /v1/back-office/me (data-model §3, contracts/back-office-me). */
export interface StaffRecordDTO {
  subject: string;
  email: string;
  roles: string[];
  status: StaffStatus;
  lastSeenAt: string;
}

export type StaffStatus = "active" | "disabled";

/** Domain shape the console renders — roles narrowed to known BackOfficeRole. */
export interface StaffRecord {
  subject: string;
  email: string;
  roles: BackOfficeRole[];
  status: StaffStatus;
}

/** Wire DTO for the existing 004 GET /v1/back-office/ping — the P2 identity proving read
 *  (token echo; role-less callers get a 403 forbidden instead of this body). */
export interface BackOfficePingDTO {
  audience: "back-office";
  subject: string;
  groups: string[];
  message: string;
}

/** Wire DTO for GET /v1/back-office/admin/ping (data-model §3, contracts/admin-ping). */
export interface BackOfficeAdminPingDTO {
  audience: "back-office";
  scope: "admin";
  subject: string;
  message: string;
}

export interface AdminPingResult {
  subject: string;
}

/** Narrow arbitrary group strings to known roles (defensive — mirrors edge-api's groups parse). */
export function toBackOfficeRoles(input: readonly string[] | undefined): BackOfficeRole[] {
  if (!input) return [];
  return input.filter((r): r is BackOfficeRole =>
    (BACK_OFFICE_ROLES as readonly string[]).includes(r),
  );
}
