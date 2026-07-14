"use server"

import { revalidatePath } from "next/cache"
import type { CustomerDTO, UpdateCustomerDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Update the customer's own details (FR-026).
 *
 * ⚠ A SERVER ACTION IS A PUBLIC ENDPOINT. It compiles to a POST route that anyone can craft a
 * request against — the fact that the only *button* which calls it sits behind a guard is
 * irrelevant. Next's own guidance: "Treat Server Actions with the same security considerations as
 * public-facing API endpoints."
 *
 * So it re-verifies the session itself rather than trusting that `proxy.ts` or the page's DAL call
 * ran. It does not accept a customer id from the caller either — the identity comes from the token,
 * never from the request body.
 *
 * The backend then enforces what is actually writable: `displayName` only. `email` is an identity
 * operation (and an account-takeover vector), `status` is platform-owned.
 */
export async function updateProfile(
  input: UpdateCustomerDTO,
): Promise<{ ok: true; customer: CustomerDTO } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Please sign in again." }

  const displayName = input.displayName?.trim() || null

  if (displayName !== null && displayName.length > 120) {
    return { ok: false, error: "That name is too long." }
  }

  try {
    const customer = await edgeApi(session.idToken).patch<CustomerDTO>(
      "/customer/v1/me",
      { displayName } satisfies UpdateCustomerDTO,
      perCustomer,
    )

    revalidatePath("/account")
    return { ok: true, customer }
  } catch {
    return { ok: false, error: "We couldn't save that. Please try again." }
  }
}
