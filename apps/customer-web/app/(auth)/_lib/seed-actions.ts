"use server"

import type { CredentialRoute } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Tell the platform which credential route this customer registered with (012 FR-013).
 *
 * ⚠ WHY THIS EXISTS AT ALL: **Cognito cannot be asked whether a user has a password.** There is no
 * such API field, and `UserStatus` does not distinguish it — a passwordless CONFIRMED user and an
 * email+password CONFIRMED user are identical on the wire. So the platform must remember, and
 * registration is the one moment it can learn the answer... except that sign-up happens client-side,
 * directly against Cognito, and the record's just-in-time upsert only ever sees a token.
 *
 * Hence this: the sign-up form declares the route it took, and the record is SEEDED from it on the
 * creating upsert. It is ignored on every call thereafter.
 *
 * ⚠⚠ IT IS CLIENT-ASSERTED AND THEREFORE UNTRUSTED — so here is why that is safe, because "untrusted
 * input decides a security-adjacent flag" should never pass review on a shrug. **Lying in either
 * direction grants the liar nothing:**
 *
 *   • "I have a password" (but you don't) → the account page offers CHANGE, which demands a current
 *     password that does not exist. Cognito refuses. You are merely stuck, and you recover via
 *     "forgot password". No capability gained.
 *
 *   • "I have no password" (but you do)   → the account page offers SET, which demands a FRESH CODE
 *     sent to the account's verified email. Anyone who can read that inbox CAN ALREADY reset the
 *     password through recovery. No capability gained.
 *
 * So it is a UX HINT, never an authorization input. The real gates are the emailed code (FR-017) and
 * the current password (FR-016), and Cognito enforces both regardless of what this flag claims. The
 * constitution's own distinction, one level down: **the claim is the origin; the record is the
 * authority.**
 */
export async function seedCredentialRoute(route: CredentialRoute): Promise<void> {
  const session = await getSession()
  if (!session) return

  try {
    // The FIRST authenticated call creates the record. The query param seeds `has_password` on that
    // INSERT and is ignored by every later call — the platform's own password writes are
    // authoritative from then on.
    await edgeApi(session).get(`/customer/v1/me?route=${route}`, perCustomer)
  } catch {
    // Non-fatal. The record still gets created on the customer's next authenticated request; it will
    // simply default to `has_password = false`, which is the SAFE error: it offers the SET flow,
    // which is gated behind an emailed code. The other error would merely leave them stuck.
  }
}
