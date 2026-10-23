"use server"

import type { ResetConfirmDTO } from "@effy/shared-types"

import { edgeApiPublic } from "@/lib/api/edge"

/**
 * Completes "forgot password" through the backend, so breach screening applies and the platform
 * records that a password now exists (a browser call would skip both). The route is public: the caller
 * has no session, and the Cognito API it wraps is unauthenticated too.
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
    // The backend already collapses wrong code, expired code and no such customer into one message; pass it through unchanged.
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
