import { announce, type LiveChange } from "./announce";

/**
 * 071 — the dispatch console changed, and these drivers' work changed with it. A reassignment names
 * BOTH drivers — the one who lost the round must see it go as surely as the other sees it arrive
 * (FR-028). Nulls and repeats are dropped.
 *
 * Shared since 081: back-office moving an order to courier takes it off drivers' rounds from the
 * orders service, and those drivers must hear it as surely as after fleet's own Unassign. ⚠ Pass the
 * drivers read BEFORE the change — `announceOrder({drivers})` reads who holds the order AFTER it, and
 * a driver it was just taken from no longer does.
 *
 * ⚠ After the commit, and it never throws.
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
