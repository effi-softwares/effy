// 113 FR-016: a new registration (or a newly saved phone) that matches a barred, erased account is allowed, and marked
// for staff (`customer.matches_erased_barred_on`). Best effort: registration is never refused or slowed by this.
import { logger, query } from "@effy/edge-shared"

import { digest, loadFingerprintKey, type FingerprintKind } from "./fingerprint"

let key: Promise<string | null> | undefined

export async function markIfMatchesErasedBarred(customerId: string, kind: FingerprintKind, value: string | null): Promise<void> {
  if (!value) return
  try {
    key ??= loadFingerprintKey()
    const k = await key
    if (!k) return
    await query(
      `UPDATE public.customer c SET matches_erased_barred_on = f.erased_at
         FROM public.erased_barred_fingerprint f
        WHERE c.id = $1 AND c.matches_erased_barred_on IS NULL AND f.kind = $2 AND f.digest = $3`,
      [customerId, kind, digest(kind, value, k)],
    )
  } catch (err) {
    key = undefined
    logger.warn({ customerId, kind, err: (err as Error)?.name }, "erasure: fingerprint check skipped")
  }
}
