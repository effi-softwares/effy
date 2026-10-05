import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCoalescer } from "./coalesce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createCoalescer", () => {
  it("reads at once for an isolated update", () => {
    const run = vi.fn();
    createCoalescer(run).trigger();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reads once more after the last of two quick updates", () => {
    const run = vi.fn();
    const c = createCoalescer(run);
    c.trigger();
    vi.advanceTimersByTime(200);
    c.trigger();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  // SC-012: ten changes within ten seconds → no more than three reads, and one after the last.
  it("reads no more than three times for ten updates in ten seconds, the last after the last update", () => {
    let lastRunAt = 0;
    const run = vi.fn(() => {
      lastRunAt = Date.now();
    });
    const c = createCoalescer(run);
    let lastTriggerAt = 0;
    for (let i = 0; i < 10; i++) {
      c.trigger();
      lastTriggerAt = Date.now();
      vi.advanceTimersByTime(900);
    }
    vi.advanceTimersByTime(10_000);
    expect(run.mock.calls.length).toBeLessThanOrEqual(3);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(lastRunAt).toBeGreaterThanOrEqual(lastTriggerAt);
  });

  it("does not wait for ever on updates that never go quiet", () => {
    const run = vi.fn();
    const c = createCoalescer(run);
    c.trigger(); // read 1
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(500);
      c.trigger();
    }
    // Six seconds of updates half a second apart: the max wait forced a read part-way through.
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("treats an update after a quiet spell as a new one and reads at once", () => {
    const run = vi.fn();
    const c = createCoalescer(run);
    c.trigger();
    vi.advanceTimersByTime(30_000);
    c.trigger();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("drops what is pending when cancelled", () => {
    const run = vi.fn();
    const c = createCoalescer(run);
    c.trigger();
    c.trigger();
    c.cancel();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
