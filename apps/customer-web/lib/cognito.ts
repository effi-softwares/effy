import { cognitoConfig } from "@/lib/config"

/**
 * The two things the server asks Cognito for: fresh tokens, and the end of a refresh token.
 *
 * Plain HTTPS calls to the pool's public API — the app client has no secret, so there is nothing to
 * sign and no SDK to load. Signing IN is not here: that happens in the browser, straight to Cognito
 * (see `app/(auth)`), and the server never sees a password or a code.
 */
const TIMEOUT_MS = 10_000

async function call(target: string, body: Record<string, unknown>): Promise<Response> {
  const { userPoolId } = cognitoConfig()
  // A pool id is `<region>_<id>`, so the region is never written down a second time.
  const region = userPoolId.split("_")[0]
  return fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

export interface FreshTokens {
  idToken: string
  accessToken: string
}

/**
 * Exchange the refresh token for a new id and access token.
 *
 * Three outcomes, and they must not be confused:
 *  • tokens — carry on;
 *  • `null` — Cognito refused the refresh token (expired, revoked, signed out everywhere). The
 *  session is over;
 *  • a thrown error — Cognito could not be reached or failed. The session may be perfectly good,
 *  so the caller must not sign anyone out on the strength of it.
 */
export async function refreshTokens(refreshToken: string): Promise<FreshTokens | null> {
  const res = await call("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: cognitoConfig().userPoolClientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  })
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`Cognito refresh failed: ${res.status}`)
  const result = ((await res.json()) as { AuthenticationResult?: { IdToken?: string; AccessToken?: string } })
    .AuthenticationResult
  if (!result?.IdToken || !result.AccessToken) throw new Error("Cognito refresh returned no tokens")
  return { idToken: result.IdToken, accessToken: result.AccessToken }
}

/**
 * End a refresh token at Cognito, so a copy of it is worthless after sign-out.
 *
 * Best effort: signing out must always succeed locally, whatever Cognito says.
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await call("RevokeToken", { Token: refreshToken, ClientId: cognitoConfig().userPoolClientId })
  } catch {
    /* the cookies are cleared regardless */
  }
}
