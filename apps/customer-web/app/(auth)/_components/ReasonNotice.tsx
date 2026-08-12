"use client"

import { InfoNote } from "./AuthKit"

/**
 * Why the shopper is being asked to sign in again (044 US4, FR-034).
 *
 * ⚠ THE PARAMETER THIS READS HAS BEEN PRODUCED SINCE 012 AND READ BY NOTHING.
 *
 * Two places navigate to `/sign-in?reason=password-changed` — `app/(account)/account/actions.ts`
 * after a signed-in password change, and the reset flow after recovery — because a password change
 * ends every session, including this one (012 FR-024). Neither the sign-in screen nor anything else
 * looked at it. So the shopper's experience of a *successful* security action was: the screen went
 * away, and they were signed out with no explanation at all (defect D-14).
 *
 * ⚠ A CLOSED VOCABULARY, AND THE VALUE IS NEVER ECHOED. This arrives in a query string, which makes
 * it attacker-controlled. Rendering it — or any substring of it — would let anyone put arbitrary text
 * on the one screen in the entire product where a person is about to type a credential. That is a
 * ready-made phishing surface, and it is the same discipline `safeNextTarget` already applies to the
 * `next` parameter. An unknown value renders NOTHING; there is deliberately no fallback message,
 * because a fallback is a way for an unrecognised value to still produce output.
 *
 * ⚠ INFORMATION, NOT AN ERROR. `InfoNote`, not `ErrorNote`: nothing has gone wrong, and dressing a
 * completed security action in the destructive treatment teaches shoppers that the error colour
 * means nothing much.
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
