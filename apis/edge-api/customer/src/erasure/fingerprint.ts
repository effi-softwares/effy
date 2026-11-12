// 113 FR-016: a barred account's email and phone, kept only as keyed digests so a new registration can be recognised.
// HMAC, not a plain hash: an email can be guessed and hashed by anyone; without the key (Secrets Manager,
// `ERASURE_FINGERPRINT_KEY_ARN`) a digest says nothing.
import { createHmac } from "node:crypto"

import { getSecretString } from "@effy/edge-shared"

export type FingerprintKind = "email" | "phone"

export const normaliseEmail = (email: string): string => email.trim().toLowerCase()
/** Digits only, so "+61 412 345 678" and "0412345678" differ (as they would on a form) but spacing never matters. */
export const normalisePhone = (phone: string): string => phone.replace(/\D/g, "")

export function digest(kind: FingerprintKind, value: string, key: string): Buffer {
  const normal = kind === "email" ? normaliseEmail(value) : normalisePhone(value)
  return createHmac("sha256", key).update(`${kind}:${normal}`).digest()
}

/**
 * The key, or null when this function isn't given one (registration then carries on without the check). The secret is
 * seeded by the operator as `{"key":"<hex>"}` (infra/envs/dev/housekeeping.tf), never by Terraform, so it never sits in
 * state. Throws while it is unseeded.
 */
export async function loadFingerprintKey(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const arn = env.ERASURE_FINGERPRINT_KEY_ARN
  if (!arn) return null
  const raw = (await getSecretString(arn)).trim()
  const key = raw.startsWith("{") ? (JSON.parse(raw) as { key?: unknown }).key : raw
  if (typeof key !== "string" || key.length < 32) throw new Error("erasure: the fingerprint key is not seeded")
  return key
}

export interface Fingerprints {
  email: Buffer | null
  phone: Buffer | null
}

export function fingerprintsOf(email: string | null, phone: string | null, key: string): Fingerprints {
  return {
    email: email ? digest("email", email, key) : null,
    phone: phone && normalisePhone(phone).length > 0 ? digest("phone", phone, key) : null,
  }
}
