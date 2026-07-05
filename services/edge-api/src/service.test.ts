import { describe, expect, it } from "vitest";

import type { StatusRepository } from "./repository";
import { createPlatformStatusService } from "./service";

const dbTime = new Date("2026-07-05T12:00:00Z");

function fakeRepo(overrides?: Partial<Awaited<ReturnType<StatusRepository["status"]>>>): StatusRepository {
  return {
    status: () =>
      Promise.resolve({
        databaseName: "effy",
        databaseTime: dbTime,
        migrationVersion: 20260705095817,
        migrationsApplied: 1,
        ...overrides,
      }),
  };
}

describe("platform status service", () => {
  it("stamps the environment onto the repository read", async () => {
    const svc = createPlatformStatusService(fakeRepo(), "dev");
    await expect(svc.getStatus()).resolves.toEqual({
      environment: "dev",
      databaseName: "effy",
      databaseTime: dbTime,
      migrationVersion: 20260705095817,
      migrationsApplied: 1,
    });
  });

  it("propagates repository errors untouched (handlers own the mapping)", async () => {
    const svc = createPlatformStatusService(
      { status: () => Promise.reject(new Error('relation "goose_db_version" does not exist')) },
      "dev",
    );
    await expect(svc.getStatus()).rejects.toThrow("goose_db_version");
  });
});
