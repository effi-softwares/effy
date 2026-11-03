import type { ConsoleTourStateDTO } from "@effy/shared-types";

import { readTourState, writeTourState, type TourAudience } from "./store";
import { parseTourPatch } from "./validate";

/** The use-cases behind `GET|PATCH /…/v1/me/tours` (106 research R15). Handlers call these, never the store. */

export function getTourState(audience: TourAudience, subject: string): Promise<ConsoleTourStateDTO> {
  return readTourState(audience, subject);
}

export type TourChangeResult =
  | { ok: true; state: ConsoleTourStateDTO }
  | { ok: false; refused: "invalid"; message: string }
  | { ok: false; refused: "full" };

export async function changeTourState(audience: TourAudience, subject: string, body: unknown): Promise<TourChangeResult> {
  const parsed = parseTourPatch(body);
  if ("error" in parsed) return { ok: false, refused: "invalid", message: parsed.error };
  const written = await writeTourState(audience, subject, parsed.value);
  return written.ok ? { ok: true, state: written.state } : { ok: false, refused: "full" };
}
