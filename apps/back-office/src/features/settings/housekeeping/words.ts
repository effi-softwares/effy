import { OPERATING_TZ, type HousekeepingAttention, type HousekeepingOutcome } from "@effy/shared-types"
import type { StatusTone } from "@effy/web-kit/patterns"

/** A run's result in one word, and its tone: the page marks anything that needs attention. */
export function resultWord(outcome: HousekeepingOutcome | null, attention: HousekeepingAttention | null): { word: string; tone: StatusTone } {
  if (attention === "failed") return { word: "Failed", tone: "problem" }
  if (attention === "late") return { word: outcome === null ? "Not run yet" : "Hasn't run", tone: "problem" }
  if (attention === "partial") return { word: "Partly worked", tone: "waiting" }
  return { word: "Worked", tone: "done" }
}

const when = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: OPERATING_TZ,
})

/** "12 Nov, 3:15 pm" on Effy's clock, or a dash. */
export const whenWords = (iso: string | null): string => (iso ? when.format(new Date(iso)) : "-")

/** The abandon time is edited in whole hours: 1 to 168 (7 days). */
export const ABANDON_HOURS = { min: 1, max: 168 } as const
