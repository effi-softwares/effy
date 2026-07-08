import type { BackOfficeRole } from "@effy/shared-types";

export interface Identity {
  subject: string;
  email: string;
  roles: BackOfficeRole[];
}

// The session query resolves to one of these. `checking` (query pending) and error states are
// provided by TanStack Query; the sign-in OTP step is the SignInScreen's local state
// (data-model §2).
export type Session =
  | { status: "signed-in"; identity: Identity }
  | { status: "signed-out" };

// Interface-layer role check (least-privilege UX). The backend remains the authoritative gate
// (US3/US4) — this only decides what the nav reveals.
export function isAdmin(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin");
}
