"use server"

import type { ResetConfirmDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"

/**
 * Complete "forgot password" — THROUGH THE BACKEND (012 FR-022b).
 *
 * ⚠⚠ THIS USED TO BE `confirmResetPassword` FROM AMPLIFY, CALLED IN THE BROWSER — AND THAT WAS TWO
 * BUGS AT ONCE. ⚠⚠
 *
 * 1. IT BYPASSED THE BREACH SCREENING. The account page refuses a password that appears in a public
 *    breach corpus. This path did not — so a customer who wanted one simply came here instead. A rule
 *    enforced on one path and not the other is not a rule; it is a detour sign.
 *
 * 2. IT CORRUPTED THE PLATFORM'S RECORD. Cognito cannot be asked whether a user has a password, so the
 *    platform must remember. Setting one here, client-side, meant the platform NEVER FOUND OUT — and
 *    the account page went on offering "Set a password" to someone who had one, permanently.
 *
 * ⚠ WHY IT IS A SERVER ACTION AND NOT A CLIENT `fetch`.
 *
 * NOT because the browser cannot find the backend. It used to be: `EDGE_API_BASE_URL` carried no
 * `NEXT_PUBLIC_` prefix, so a client-side fetch would have posted to `undefined/customer/v1/...`.
 * That prefix now exists (lib/config.ts records why it had to), and with it the accident that used
 * to enforce this rule. What remains is the reason that always mattered: the two defects above.
 * Breach screening and the platform's `has_password` record are applied HERE, on the way through,
 * and a call made from the browser would reach the same public route having skipped both.
 *
 * The backend route itself is PUBLIC (no authorizer), which is correct: the caller has no session —
 * that is the entire point of account recovery — and the Cognito API it wraps is unauthenticated too,
 * so it holds no privilege at all.
 */
export async function finishPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await edgeApiPublic().post(
      "/customer/v1/password/reset-confirm",
      { email, code, newPassword } satisfies ResetConfirmDTO,
      { cache: "no-store" },
    )
    return { ok: true }
  } catch (err) {
    // ⚠ The backend has ALREADY collapsed "wrong code" / "expired code" / "no such customer" into ONE
    // message — deliberately, so this endpoint cannot be used to enumerate who shops at Effy. Pass its
    // message through unchanged; do not try to be more helpful here, because being more helpful here
    // means telling an attacker whether an address is registered.
    const detail = (err as { detail?: unknown })?.detail
    return {
      ok: false,
      error:
        typeof detail === "string" && detail.length > 0
          ? detail
          : "We couldn't reset your password. Please try again.",
    }
  }
}
