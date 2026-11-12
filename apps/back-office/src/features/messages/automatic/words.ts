import type { AutomationRunDTO, AutomationStatus } from "@effy/shared-types"
import type { StatusTone } from "@effy/web-kit/patterns"

export const AUTOMATION_STATUS_WORD: Record<AutomationStatus, string> = {
  active: "Running",
  paused: "Paused",
  finished: "Ended",
}

export const AUTOMATION_STATUS_TONE: Record<AutomationStatus, StatusTone> = {
  active: "moving",
  paused: "waiting",
  finished: "quiet",
}

export const MODE_WORD = { trigger: "When something happens", repeat: "On a repeat" } as const

export const RUN_WORD: Record<AutomationRunDTO["outcome"], string> = {
  sent_to_message: "Sent",
  nobody: "Nobody to send to",
  waited: "Waited for the last one to finish",
}

/** What staff are told about the rules an automatic message keeps. */
export const AUTOMATIC_RULES =
  "Each run is sent as its own message, with the same rules as one sent by hand: only people who said yes get offers and news, nothing at night, and the daily limits apply."
export const TRIGGER_ONCE =
  "Each customer gets it once each time it happens. A new order starts again. It looks only from when it starts, so nobody who stopped ordering long ago gets it at once."
