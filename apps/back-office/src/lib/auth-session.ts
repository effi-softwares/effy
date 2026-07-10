import { getGroups } from "@effy/web-kit";
import { toBackOfficeRoles, type BackOfficeRole } from "@effy/shared-types";

// The ACCESS token goes to edge-api's JWT authorizer (research C3) — NEVER the ID token.
export { getAccessToken, getSubject } from "@effy/web-kit";

// Reading `cognito:groups` is shared; narrowing it to THIS surface's role union is not.
export async function getRoles(): Promise<BackOfficeRole[]> {
  return toBackOfficeRoles(await getGroups());
}
