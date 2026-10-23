"use server"

import type { CredentialRoute, CustomerDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

/**
 * Tells the platform which credential route this customer registered with, since Cognito cannot be
 * asked whether a user has a password. It seeds `has_password` on the creating upsert only. Client-
 * asserted, but lying grants nothing: claiming a password leads to a change flow that needs the current
 * one; claiming none leads to a set flow that needs a fresh emailed code. A UX hint, never authorization.
 */
export async function seedCredentialRoute(route: CredentialRoute): Promise<boolean> {
  const session = await getSession()
  if (!session) return false

  try {
    // The first authenticated call creates the record; the query param seeds `has_password` on that insert only.
    await edgeApi(session).get(`/customer/v1/me?route=${route}`, perCustomer)
    return true
  } catch {
    // Non-fatal for `has_password` (the record defaults to false, offering the code-gated set flow), but
    // reported, so the name step ensures the record before its PATCH (which would otherwise answer 403).
    return false
  }
}

/**
 * Makes sure the customer's record exists and returns it: `GET /customer/v1/me` is the idempotent upsert
 * that creates it, and a `PATCH` without it answers 403 with the barred wording. (Mobile cannot reach a
 * screen without that GET.)
 */
export async function ensureCustomerRecord(): Promise<CustomerDTO | null> {
  const session = await getSession()
  if (!session) return null

  try {
    return await edgeApi(session).get<CustomerDTO>("/customer/v1/me", perCustomer)
  } catch {
    return null
  }
}
