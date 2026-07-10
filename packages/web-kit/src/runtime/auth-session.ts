import { fetchAuthSession } from "aws-amplify/auth";

/**
 * Session/token accessors.
 *
 * The ACCESS token is the bearer for every API call — never the ID token (research R6). The ID
 * token is read only for the operator's email, which the access token does not carry on a pool
 * that uses email-as-username.
 */

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

/** Raw `cognito:groups` from the access token. Callers narrow it to their own role union. */
export async function getGroups(): Promise<string[]> {
  try {
    const session = await fetchAuthSession();
    const claim = session.tokens?.accessToken?.payload["cognito:groups"];
    return Array.isArray(claim) ? claim.map(String) : [];
  } catch {
    return [];
  }
}

/** The operator's email, from the ID token. Absent before sign-in completes. */
export async function getEmail(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    const email = session.tokens?.idToken?.payload.email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}
