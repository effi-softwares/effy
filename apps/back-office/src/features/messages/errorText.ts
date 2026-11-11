import { isDomainError } from "@effy/api-client"

const BY_TYPE: Record<string, string> = {
  "message-changed": "Someone else changed this message. Reload it to see their change, then try again.",
  "message-not-editable": "This message can't be changed now: it has already gone, or it was cancelled.",
  "message-must-name-effy": "Offers and news must say they're from Effy.",
  "too-many-recipients": "This message would reach more people than one message may. Narrow who gets it.",
  "audience-changed": "The number of people has changed since you looked. Check it and send again.",
  "confirmation-required": "Type the number of customers to send to all of them.",
  "audience-empty": "Nobody matches who this is for. Change the filters.",
  "recipient-unavailable": "That person can't receive messages: their account is closed or they're not active.",
  "invalid-destination": "Choose another place for a tap to lead: that one isn't available.",
  "invalid-audience": "One of the filters isn't valid. Check who it's for.",
  "message-not-found": "This message no longer exists.",
}

/** The words for a refused messages request; never the server's own text. */
export function messageError(err: unknown): string {
  if (!isDomainError(err)) return "That didn't work. Check your connection and try again."
  if (err.kind === "forbidden") return "That needs a manager or an administrator."
  const slug = err.type?.split("/").pop() ?? ""
  return (
    BY_TYPE[slug] ??
    (err.kind === "unavailable"
      ? "Effy can't be reached right now. Try again in a moment."
      : "That didn't work. Check the message and try again.")
  )
}

/** A number the refusal carried (the current count, the limit), when it did. */
export function refusalNumber(err: unknown, field: "count" | "limit"): number | null {
  if (!isDomainError(err)) return null
  const v = err.fields?.find((f) => f.field === field)?.message
  return v !== undefined && /^\d+$/.test(v) ? Number(v) : null
}

export function refusalSlug(err: unknown): string | null {
  return isDomainError(err) ? (err.type?.split("/").pop() ?? null) : null
}
