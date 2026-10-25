import { toBackOfficeRoles } from "@effy/shared-types"
import { fetchAuthSession } from "aws-amplify/auth"

import type { Session } from "./model"

export { signOutUser } from "@effy/web-kit"

export async function loadSession(): Promise<Session> {
  const { tokens } = await fetchAuthSession()
  const access = tokens?.accessToken
  if (!access) return { status: "signed-out" }

  const subject = typeof access.payload.sub === "string" ? access.payload.sub : ""
  const groupsClaim = access.payload["cognito:groups"]
  const roles = toBackOfficeRoles(Array.isArray(groupsClaim) ? groupsClaim.map(String) : undefined)
  const emailClaim = tokens?.idToken?.payload.email
  const email = typeof emailClaim === "string" ? emailClaim : ""

  return { status: "signed-in", identity: { subject, email, roles } }
}
