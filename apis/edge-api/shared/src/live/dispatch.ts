import { announce, type LiveChange } from "./announce";

/**
 * The dispatch console changed, and these drivers' work with it. A reassignment names both drivers.
 * Pass the drivers read before the change: one it was taken from no longer holds it. Nulls and
 * repeats are dropped. After the commit; never throws.
 */
export async function announceDispatch(driverIds: ReadonlyArray<string | null | undefined> = []): Promise<void> {
  const changes: LiveChange[] = [{ scope: "ops", kind: "dispatch" }];
  for (const driverId of new Set(driverIds)) {
    if (driverId) changes.push({ scope: "driver", driverId, kind: "work" });
  }
  await announce(changes);
}

/** Slot load or the delivery calendar changed. */
export const announceSlots = (): Promise<void> => announce([{ scope: "ops", kind: "slots" }]);
