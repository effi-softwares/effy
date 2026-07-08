// Domain types for the back-office staff/RBAC system of record (005). Wire shapes (DB rows) are
// mapped explicitly in the repository and never leak past it (Principle VI). The /me response
// shape is the contract in specs/005-back-office-web/contracts/back-office-me.contract.md.

export type StaffStatus = "active" | "disabled";
export type BackOfficeRole = "admin" | "manager" | "csa";

export const KNOWN_ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"];

export interface StaffRecord {
  subject: string; // cognito_sub — the platform's authoritative identity key
  email: string;
  roles: BackOfficeRole[];
  status: StaffStatus;
  lastSeenAt: string; // ISO 8601
}
