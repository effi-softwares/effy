import { isDomainError } from "@effy/api-client"

import type { ExclusionReasonDTO } from "@effy/shared-types"

import { REASON_TEXT } from "./model"

type DispatchAction = "reassign" | "unassign" | "reorder"

const FORBIDDEN: Record<DispatchAction, string> = {
  reassign: "You do not have permission to move a round to another driver.",
  unassign: "You do not have permission to take work back from a driver.",
  reorder: "You do not have permission to change a round's order.",
}

const STALE: Record<DispatchAction, string> = {
  reassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  unassign: "Somebody else changed this round while you were looking at it. Reload and try again.",
  reorder: "Somebody else changed this round while you were looking at it. Reload and try again.",
}

export function dispatchActionError(err: unknown, action: DispatchAction): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed - try again."
  }

  if (err.status === 403) return FORBIDDEN[action]
  if (err.status === 404) return "That round no longer exists. It may have been replanned since this page loaded."
  if (err.status === 409) return STALE[action]

  if (err.status === 422) {
    const named = refusalReasons(err)
    if (named.length > 0) {
      return `That driver cannot take this round: ${named.join("; ").toLowerCase()}.`
    }
  }

  return "That change could not be made. Nothing was altered."
}

export function refusalReasons(err: unknown): string[] {
  if (!isDomainError(err)) return []
  return (err.fields ?? [])
    .map((f) => REASON_TEXT[f.field as ExclusionReasonDTO])
    .filter((m): m is string => typeof m === "string" && m !== "")
}
