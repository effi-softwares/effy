// "Today" home use-case (049): resolve the driver's current phase + remaining count (FR-021).
// The active stop/drop refs and the up-next queue are populated by the collection/delivery slices
// (US1/US2); the foundation returns the phase and a counts-only remaining total.

import type { TodayDTO } from "@effy/shared-types";

import * as repo from "./repository";

export async function loadToday(driverId: string): Promise<TodayDTO> {
  const run = await repo.findActiveRun(driverId);
  if (!run) {
    return { phase: "idle", activeRunId: null, active: null, upNext: [], remainingCount: 0 };
  }

  const remainingCount =
    run.type === "collection"
      ? await repo.countRemainingCollectionStops(run.run_id)
      : await repo.countRemainingDrops(run.run_id);

  return {
    phase: run.type === "collection" ? "collection" : "same_day_delivery",
    activeRunId: run.run_id,
    active: null, // active stop/drop ref populated by US1/US2
    upNext: [],
    remainingCount,
  };
}
