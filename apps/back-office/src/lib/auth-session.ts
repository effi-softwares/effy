import { fetchAuthSession } from "aws-amplify/auth";

import { toBackOfficeRoles, type BackOfficeRole } from "@effy/shared-types";

// The ACCESS token goes to edge-api's JWT authorizer (research C3) — NEVER the ID token.
// fetchAuthSession auto-refreshes when a valid refresh token exists; forceRefresh mints one now.

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  try {
    const session = await fetchAuthSession(forceRefresh ? { forceRefresh: true } : undefined);
    return session.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function getSubject(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    const sub = session.tokens?.accessToken?.payload.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

// RBAC groups from the access token's `cognito:groups` claim, narrowed to known roles.
export async function getRoles(): Promise<BackOfficeRole[]> {
  try {
    const session = await fetchAuthSession();
    const claim = session.tokens?.accessToken?.payload["cognito:groups"];
    const groups = Array.isArray(claim) ? claim.map(String) : undefined;
    return toBackOfficeRoles(groups);
  } catch {
    return [];
  }
}
