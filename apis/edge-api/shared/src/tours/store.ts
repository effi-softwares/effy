import {
  EMPTY_TOUR_STATE,
  TOUR_OUTCOMES,
  TOUR_STATE_MAX_KEYS,
  type ConsoleTourPatch,
  type ConsoleTourSeenDTO,
  type ConsoleTourStateDTO,
} from "@effy/shared-types";

import { pooled, type Queryable } from "../lib/db";

/**
 * The ONE reader and writer of `public.console_tour_state` (106). A person's row is read whole and written one change
 * at a time; a tour's outcome is merged into `seen` in the statement itself, so two tabs writing different tours
 * cannot lose each other's write. `tours.guard.test.ts` fails any other file that names the table.
 */

/** Which console's people the row belongs to - set by the service, never by a client. */
export type TourAudience = "shop" | "admin";

interface Row {
  offer_tours: boolean;
  seen: Record<string, unknown> | null;
}

const OUTCOMES: readonly string[] = TOUR_OUTCOMES;

function mapSeen(raw: Record<string, unknown> | null): Record<string, ConsoleTourSeenDTO> {
  const out: Record<string, ConsoleTourSeenDTO> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value !== "object" || value === null) continue;
    const { v, outcome, at } = value as { v?: unknown; outcome?: unknown; at?: unknown };
    if (typeof v !== "number" || typeof outcome !== "string" || !OUTCOMES.includes(outcome)) continue;
    const when = typeof at === "string" ? new Date(at) : null;
    out[key] = {
      version: v,
      outcome: outcome as ConsoleTourSeenDTO["outcome"],
      at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : new Date(0).toISOString(),
    };
  }
  return out;
}

const map = (row: Row): ConsoleTourStateDTO => ({ offerTours: row.offer_tours, seen: mapSeen(row.seen) });

const READ = `
SELECT offer_tours, seen
  FROM public.console_tour_state
 WHERE audience = $1 AND subject = $2`;

/** No row reads as "offer everything, nothing seen". */
export async function readTourState(
  audience: TourAudience,
  subject: string,
  db: Queryable = pooled,
): Promise<ConsoleTourStateDTO> {
  const { rows } = await db.query<Row>(READ, [audience, subject]);
  return rows[0] ? map(rows[0]) : { offerTours: EMPTY_TOUR_STATE.offerTours, seen: {} };
}

// A tour's outcome: merged in; refused (no row returned) when it would add a key past the limit.
const WRITE_TOUR = `
INSERT INTO public.console_tour_state (audience, subject, seen)
VALUES ($1, $2, jsonb_build_object($3::text, jsonb_build_object('v', $4::int, 'outcome', $5::text, 'at', now())))
ON CONFLICT (audience, subject) DO UPDATE
   SET seen = public.console_tour_state.seen || EXCLUDED.seen,
       updated_at = now()
 WHERE public.console_tour_state.seen ? $3::text
    OR (SELECT count(*) FROM jsonb_object_keys(public.console_tour_state.seen)) < $6::int
RETURNING offer_tours, seen`;

const WRITE_OFFER = `
INSERT INTO public.console_tour_state (audience, subject, offer_tours)
VALUES ($1, $2, $3)
ON CONFLICT (audience, subject) DO UPDATE
   SET offer_tours = EXCLUDED.offer_tours,
       updated_at = now()
RETURNING offer_tours, seen`;

const RESET = `
INSERT INTO public.console_tour_state (audience, subject)
VALUES ($1, $2)
ON CONFLICT (audience, subject) DO UPDATE
   SET seen = '{}'::jsonb,
       updated_at = now()
RETURNING offer_tours, seen`;

export type TourWriteResult = { ok: true; state: ConsoleTourStateDTO } | { ok: false; reason: "full" };

export async function writeTourState(
  audience: TourAudience,
  subject: string,
  patch: ConsoleTourPatch,
  db: Queryable = pooled,
): Promise<TourWriteResult> {
  let rows: Row[];
  if ("tour" in patch) {
    ({ rows } = await db.query<Row>(WRITE_TOUR, [
      audience,
      subject,
      patch.tour,
      patch.version,
      patch.outcome,
      TOUR_STATE_MAX_KEYS,
    ]));
  } else if ("offerTours" in patch) {
    ({ rows } = await db.query<Row>(WRITE_OFFER, [audience, subject, patch.offerTours]));
  } else {
    ({ rows } = await db.query<Row>(RESET, [audience, subject]));
  }
  return rows[0] ? { ok: true, state: map(rows[0]) } : { ok: false, reason: "full" };
}
