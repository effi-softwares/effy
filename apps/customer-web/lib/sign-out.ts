import "server-only"

import { cookies } from "next/headers"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { revokeRefreshToken } from "@/lib/cognito"
import { clearSessionCookies, getSession } from "@/lib/session"
import { SESSION_COOKIES } from "@/lib/session-cookies"

/**
 * End the session on this device, or on every device.
 *
 * The refresh token is revoked, not just forgotten: deleting a cookie ends nothing for a copy of
 * the token, which would otherwise keep minting sessions for up to thirty days.
 *
 * "Everywhere" is the backend's job (it ends every refresh token the customer holds); a failure
 * there must not stop this device being signed out.
 */
export async function endSession({ allDevices }: { allDevices: boolean }): Promise<void> {
  if (allDevices) {
    const session = await getSession().catch(() => null)
    if (session) {
      try {
        await edgeApi(session).delete("/customer/v1/sessions", perCustomer)
      } catch {
        /* this device is still signed out below */
      }
    }
  }
  const refreshToken = (await cookies()).get(SESSION_COOKIES.refresh)?.value
  if (refreshToken) await revokeRefreshToken(refreshToken)
  await clearSessionCookies()
}
