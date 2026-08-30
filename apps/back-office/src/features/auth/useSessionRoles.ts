import { useQuery } from "@tanstack/react-query";

import type { BackOfficeRole } from "@effy/shared-types";

import { sessionQuery } from "./queries";

/**
 * The signed-in operator's roles, or an empty list when signed out or still loading.
 *
 * ⚠ ROLES ARE FOR REVEALING CONTROLS, NEVER FOR GATING. Every capability check built on this is a
 * courtesy so an operator is not shown a button that will refuse them; the backend decides from the
 * `admin.staff` record independently (Principle IV: "a valid claim never overrides it").
 *
 * ⚠ Empty-while-loading is the SAFE default and is deliberate: a screen renders as read-only for a
 * moment and then reveals its controls, rather than flashing a control and withdrawing it.
 *
 * Added by 056 because the driver console needed the same two lines in five components. `orders` and
 * `shops` still inline them (`session?.status === "signed-in" ? session.identity.roles : []`); they
 * are welcome to adopt this, but this slice does not rewrite screens it did not otherwise touch.
 */
export function useSessionRoles(): readonly BackOfficeRole[] {
  const { data: session } = useQuery(sessionQuery);
  return session?.status === "signed-in" ? session.identity.roles : [];
}
