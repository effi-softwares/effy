// "Today" home use-case (049): resolve the driver's current phase + remaining count (FR-021).
// The active stop/drop refs and the up-next queue are populated by the collection/delivery slices
// (US1/US2); the foundation returns the phase and a counts-only remaining total.

import type { TodayDTO, TodayItemRef } from "@effy/shared-types";

import * as repo from "./repository";

export async function loadToday(driverId: string): Promise<TodayDTO> {
  const run = await repo.findActiveRun(driverId);
  if (!run) {
    return { phase: "idle", activeRunId: null, active: null, upNext: [], remainingCount: 0 };
  }

  const isCollection = run.type === "collection";
  const remainingCount = isCollection
    ? await repo.countRemainingCollectionStops(run.run_id)
    : await repo.countRemainingDrops(run.run_id);

  const activeRow = isCollection
    ? await repo.activeCollectionStop(run.run_id)
    : await repo.activeDrop(run.run_id);

  const active: TodayItemRef | null = activeRow
    ? {
        kind: isCollection ? "collection_stop" : "delivery_drop",
        id: activeRow.id,
        runId: run.run_id,
        title: activeRow.title,
        subtitle: activeRow.subtitle,
        status: activeRow.status,
      }
    : null;

  return {
    phase: isCollection ? "collection" : "same_day_delivery",
    activeRunId: run.run_id,
    active,
    upNext: [],
    remainingCount,
  };
}
