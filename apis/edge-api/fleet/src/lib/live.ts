import { logger, query } from "@effy/edge-shared";
import { announce, type LiveChange } from "@effy/edge-shared/live";

/**
 * 071 — what a dispatcher's action (or a planning pass) changes on other screens.
 *
 * Called by a handler straight after its service call has returned, i.e. after the transaction has
 * committed — never inside it. Nothing here throws: the assignment has already happened (FR-006).
 */

/**
 * The dispatch console changed, and these drivers' work changed with it. A reassignment names BOTH
 * drivers — the one who lost the round must see it go as surely as the other sees it arrive
 * (FR-028). Nulls and repeats are dropped.
 */
export async function announceDispatch(driverIds: ReadonlyArray<string | null | undefined> = []): Promise<void> {
  const changes: LiveChange[] = [{ scope: "ops", kind: "dispatch" }];
  for (const driverId of new Set(driverIds)) {
    if (driverId) changes.push({ scope: "driver", driverId, kind: "work" });
  }
  await announce(changes);
}

/** Slot load or the delivery calendar changed — back-office's slot screen. */
export const announceSlots = (): Promise<void> => announce([{ scope: "ops", kind: "slots" }]);

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
