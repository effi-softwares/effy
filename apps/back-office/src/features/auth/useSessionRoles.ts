import { useQuery } from "@tanstack/react-query";

import type { BackOfficeRole } from "@effy/shared-types";

import { sessionQuery } from "./queries";

/**
 * The signed-in operator's roles, or an empty list when signed out or still loading. Roles reveal
 * controls, never gate them: the backend decides from the `admin.staff` record. Empty while loading, so a
 * screen reveals its controls rather than flashing and withdrawing one.
 */
export function useSessionRoles(): readonly BackOfficeRole[] {
  const { data: session } = useQuery(sessionQuery);
  return session?.status === "signed-in" ? session.identity.roles : [];
}
