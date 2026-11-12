import { describe, expect, it } from "vitest";

import { HOUSEKEEPING_JOB_KEYS } from "@effy/shared-types";

import { edgeSources } from "./edge-sources";

/**
 * 113: `housekeeping_run` is what staff trust to say the clean-ups worked. One writer (`recordRun`), never updated, and
 * deleted only by the purge (runs older than 400 days).
 */
describe("housekeeping runs have one writer (113)", () => {
  const files = edgeSources();

  it("only lib/housekeeping.ts inserts a run", () => {
    const writers = files
      .filter(({ text }) => /INSERT\s+INTO\s+public\.housekeeping_run\b/i.test(text))
      .map(({ file }) => file);
    expect(writers).toEqual(["shared/src/lib/housekeeping.ts"]);
  });

  it("nothing updates a run, and only the purge deletes one", () => {
    expect(files.filter(({ text }) => /UPDATE\s+public\.housekeeping_run\b/i.test(text)).map((f) => f.file)).toEqual([]);
    const deleters = files
      .filter(({ text }) => /DELETE\s+FROM\s+public\.housekeeping_run\b/i.test(text))
      .map(({ file }) => file);
    expect(deleters).toEqual(["notifications/src/purge/repository.ts"]);
  });

  it("every recordRun names a declared job", () => {
    const named = files.flatMap(({ file, text }) =>
      [...text.matchAll(/recordRun\(\s*"([a-z_]+)"/g)].map((m) => ({ file, job: m[1]! })),
    );
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const { file, job } of named) {
      expect(HOUSEKEEPING_JOB_KEYS as readonly string[], `${file} names ${job}`).toContain(job);
    }
    expect(new Set(named.map((n) => n.job))).toEqual(new Set(HOUSEKEEPING_JOB_KEYS));
  });
});
