import type { ShopRole } from "@effy/shared-types";

export interface Identity {
  subject: string;
  email: string;
  roles: ShopRole[];
}

export type Session = { status: "signed-in"; identity: Identity } | { status: "signed-out" };

// Re-exported from shared-types so screens import one thing. The interface uses this to hide
// controls; the BACKEND independently decides the same question from the platform record
// (role AND status AND shop scope) — this is never the guard.
export { isShopManager } from "@effy/shared-types";
