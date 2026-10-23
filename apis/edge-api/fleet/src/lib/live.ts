import { logger, query } from "@effy/edge-shared";
import { announceDispatch, announceSlots } from "@effy/edge-shared/live";

/** What a dispatcher's action or a planning pass changes on other screens. Called after commit; never throws. */

// announceDispatch and announceSlots live in @effy/edge-shared/live.
export { announceDispatch, announceSlots };

/** Read before a reassignment so the losing driver can be told. `null` if unreadable: the action still goes ahead. */
export async function driverOfRound(roundId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ driver_id: string }>(
      `SELECT driver_id::text AS driver_id FROM public.driver_round WHERE id = $1`,
      [roundId],
    );
    return rows[0]?.driver_id ?? null;
  } catch (err) {
    logger.warn({ err }, "live: could not read a round's driver");
    return null;
  }
}

/** Same contract as `driverOfRound`. */
export async function driverOfDutySession(sessionId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ driver_id: string }>(
      `SELECT driver_id::text AS driver_id FROM public.driver_duty_session WHERE id = $1`,
      [sessionId],
    );
    return rows[0]?.driver_id ?? null;
  } catch (err) {
    logger.warn({ err }, "live: could not read a duty session's driver");
    return null;
  }
}
