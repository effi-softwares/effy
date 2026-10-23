"use client"

import { InfoNote } from "./AuthKit"

/**
 * Why the shopper is asked to sign in again (`?reason=password-changed`, after a password change or
 * reset, which ends every session). A closed vocabulary and never echoed: the query string is
 * attacker-controlled, and this is the screen where a credential is typed; an unknown value renders
 * nothing. Information (`InfoNote`), not an error.
 */
const MESSAGES: Record<string, string> = {
  "password-changed":
    "Your password was changed, so you've been signed out everywhere. Sign in again with your new password.",
}

export function ReasonNotice({ reason }: { reason: string | null }) {
  if (!reason) return null
  const message = MESSAGES[reason]
  if (!message) return null
  return <InfoNote>{message}</InfoNote>
}
