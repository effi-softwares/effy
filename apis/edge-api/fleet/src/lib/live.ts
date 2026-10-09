import { logger, query } from "@effy/edge-shared";
import { announceDispatch, announceSlots } from "@effy/edge-shared/live";

/**
 * 071 — what a dispatcher's action (or a planning pass) changes on other screens.
 *
 * Called by a handler straight after its service call has returned, i.e. after the transaction has
 * committed — never inside it. Nothing here throws: the assignment has already happened (FR-006).
 */

// announceDispatch and announceSlots moved to @effy/edge-shared/live (081) — one definition.
export { announceDispatch, announceSlots };

/**
 * Who holds a round right now. Read BEFORE a reassignment or an unassignment so the driver losing
 * it can be told afterwards. `null` if it cannot be read — the action still goes ahead, and that
 * driver's app catches up on its next read.
 */
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

/** The driver a duty session belongs to. Same contract as `driverOfRound`. */
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
