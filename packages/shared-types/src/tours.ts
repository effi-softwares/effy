/**
 * Guided tours (106): what a person has been offered, per console. One row per person on the server
 * (`public.console_tour_state`); the tours and their words live in each console's own `tours.ts`.
 */

/** How a tour ended for a person. A tour is recorded as `closed` the moment it starts (106 research R13). */
export const TOUR_OUTCOMES = ["finished", "closed", "declined"] as const
export type TourOutcome = (typeof TOUR_OUTCOMES)[number]

/** A tour key: lower-case words joined by hyphens, at most 40 characters. */
export const TOUR_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
export const TOUR_VERSION_MAX = 1000
/** A guard on the row's size; the consoles have far fewer tours than this. */
export const TOUR_STATE_MAX_KEYS = 100

export interface ConsoleTourSeenDTO {
  version: number
  outcome: TourOutcome
  /** ISO 8601. */
  at: string
}

export interface ConsoleTourStateDTO {
  /** "Offer tours on new pages". */
  offerTours: boolean
  seen: Record<string, ConsoleTourSeenDTO>
}

/** Exactly one change per write. */
export type ConsoleTourPatch =
  | { tour: string; version: number; outcome: TourOutcome }
  | { offerTours: boolean }
  | { reset: true }

/** A person with no row. */
export const EMPTY_TOUR_STATE: ConsoleTourStateDTO = Object.freeze({ offerTours: true, seen: Object.freeze({}) }) as ConsoleTourStateDTO
