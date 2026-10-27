import { isDomainError } from "@effy/api-client"
import type { BackOfficeProductState } from "@effy/shared-types"
import type { StatusTone } from "@effy/web-kit/patterns"

/** The closed status mapping: on sale is done, review is waiting, held is a problem, the rest inert. */
export const STATE_TONE: Record<BackOfficeProductState, StatusTone> = {
  on_sale: "done",
  in_review: "waiting",
  change_pending: "waiting",
  held: "problem",
  off_sale: "muted",
  draft: "quiet",
  archived: "muted",
}

/** The API's conflict codes, as staff read them. */
const CONFLICT_WORDS: Record<string, string> = {
  stale: "Someone changed this product while you were looking. It has been reloaded — check it and try again.",
  already_held: "This product is already held.",
  not_held: "This product is not held.",
  archived: "An archived product cannot be held.",
  product_held: "The product is held, so this size cannot go on sale. Release the product first.",
  last_variant: "This is the last size on sale. Take the product off sale instead.",
  not_effy_owned: "This product now belongs to the shop; Effy can no longer edit its content.",
  shop_not_active: "This shop is not active.",
  nothing_ready: "No row is ready to create.",
  import_state: "This import has moved on. It has been reloaded.",
}

/** The sentence for an API error. The server's `detail` is read only for its leading code, never shown. */
export function productErrorText(err: unknown): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "This needs a manager or an administrator."
    if (err.kind === "not-found") return "This product no longer exists."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
    const code = /^([a-z_]+):/.exec(err.detail ?? "")?.[1]
    if (code && CONFLICT_WORDS[code]) return CONFLICT_WORDS[code]
    if (err.status === 409) return CONFLICT_WORDS.stale!
    if (err.status === 400) {
      const f = err.fields?.[0]
      return f ? `Check ${f.field}: ${f.message}.` : "Check what you entered and try again."
    }
  }
  return "Something went wrong. Please try again."
}
