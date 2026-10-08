// Service for the delivery settings and collection runs (047; fee plans moved to pricing.service.ts in 077).
// Validation + orchestration; no SQL, no HTTP.
import { announce } from "@effy/edge-shared/live";

import * as repo from "./repository";
import { DeliveryError, type Settings } from "./types";

// ── Zones & serviceability (047) ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings | null> {
  return repo.readSettings();
}

export async function putSettings(input: Settings, sub: string): Promise<Settings> {
  if (Number.isNaN(Number(input.hubLatitude)) || Number.isNaN(Number(input.hubLongitude))) {
    throw new DeliveryError("invalid_zone", "hub latitude and longitude must be numbers");
  }
  if (!Number.isInteger(input.samedayPrepBufferMin) || input.samedayPrepBufferMin < 0) {
    throw new DeliveryError("invalid_zone", "prep buffer must be a non-negative whole number of minutes");
  }
  const saved = await repo.upsertSettings(input, sub);
  // 076 — a hub move changed the coverage list's distances: an open Coverage screen re-reads.
  if (saved.distances) await announce([{ scope: "ops", kind: "coverage" }]);
  return saved;
}

// ── Collection runs (047 US2) ────────────────────────────────────────────

export async function listCollectionRuns() {
  return repo.listCollectionRuns();
}

export async function createCollectionRun(runTime: string, label: string | null, sub: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test((runTime ?? "").trim())) {
    throw new DeliveryError("invalid_zone", "run time must be HH:MM (24-hour, Australia/Melbourne)");
  }
  await repo.createCollectionRun(runTime.trim(), label?.trim() || null, sub);
  return repo.listCollectionRuns();
}

export async function deleteCollectionRun(id: string, sub: string) {
  await repo.deleteCollectionRun(id, sub);
  return repo.listCollectionRuns();
}
