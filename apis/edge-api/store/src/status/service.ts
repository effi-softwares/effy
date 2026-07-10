// Service layer: domain logic and shaping — no HTTP, no SQL. Version-NEUTRAL: the v1
// and v2 handlers consume this service unchanged (research A3).
import type { StatusRepository } from "./repository";
import type { PlatformStatus } from "./types";

export interface PlatformStatusService {
  getStatus(): Promise<PlatformStatus>;
}

export function createPlatformStatusService(
  repo: StatusRepository,
  environment: string,
): PlatformStatusService {
  return {
    async getStatus(): Promise<PlatformStatus> {
      const status = await repo.status();
      return { ...status, environment };
    },
  };
}
