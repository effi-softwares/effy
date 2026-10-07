import type { Context, ScheduledEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

const runPass = vi.hoisted(() => vi.fn());
const announceDispatch = vi.hoisted(() => vi.fn());
vi.mock("../planner/service", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../planner/service");
  return { passChangedAnything: actual.passChangedAnything, runPass };
});
vi.mock("../lib/live", () => ({ announceDispatch }));
vi.mock("../dispatch/custody", () => ({ maxCustodyHours: async () => 0 }));

import { handler } from "./plan-waves-scheduled";

/**
 * ⚠ THE TEST WHOSE ABSENCE LET THE PLANNER SHIP DEAD.
 *
 * The first version of this handler called `preamble(event as never, context)`. `preamble` reads
 * `event.requestContext.requestId` — it exists to correlate an HTTP request — and an EventBridge
 * event has no `requestContext`. So EVERY invocation since deploy died on the handler's first line,
 * three times per tick because Lambda retries an async invocation twice, and the engine never ran.
 *
 * Nothing else could have caught it. The planner's own tests exercise `planWave`, which is pure. The
 * container tests call the repository and service directly. The config-contract test reads the YAML.
 * `tsc` was silenced by `event as never`, which is the whole lesson: a cast that asserts a shape the
 * runtime never produces turns a compile-time check into a runtime crash.
 *
 * So this file invokes the handler with the REAL event shape AWS sends.
 */

/** What EventBridge actually delivers for `- schedule: rate(5 minutes)`. */
const SCHEDULED_EVENT: ScheduledEvent = {
  id: "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
  version: "0",
  account: "123456789012",
  time: "2026-09-21T14:05:00Z",
  region: "ap-southeast-2",
  resources: ["arn:aws:events:ap-southeast-2:123456789012:rule/effy-edge-fleet-dev-planWaves"],
  source: "aws.events",
  "detail-type": "Scheduled Event",
  detail: {},
};

function ctx(): Context {
  return {
    awsRequestId: "req-1",
    callbackWaitsForEmptyEventLoop: true,
    functionName: "planWavesScheduled",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn",
    memoryLimitInMB: "256",
    logGroupName: "lg",
    logStreamName: "ls",
    getRemainingTimeInMillis: () => 60_000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  } as Context;
}

const invoke = async (c: Context = ctx()) =>
  (handler as unknown as (e: ScheduledEvent, c: Context) => Promise<void>)(SCHEDULED_EVENT, c);

const kind = (k: "collection" | "delivery", p: Record<string, unknown> = {}) => ({
  kind: k,
  considered: 0,
  assigned: 0,
  unassigned: 0,
  unassignedPastOpening: 0,
  skippedReason: null,
  ...p,
});

const pass = (p: Record<string, unknown> = {}) => ({
  skipped: null,
  collection: kind("collection"),
  delivery: kind("delivery"),
  released: 0,
  reasonsChanged: false,
  driverIds: [],
  ...p,
});

describe("planWavesScheduled — invoked the way AWS invokes it", () => {
  it("runs without touching anything an HTTP event would have carried", async () => {
    runPass.mockReset().mockResolvedValue(pass());
    await expect(invoke()).resolves.toBeUndefined();
    expect(runPass).toHaveBeenCalledOnce();
  });

  it("does not wait for the event loop to drain — the pg pool keeps a socket warm", async () => {
    runPass.mockResolvedValue(pass());
    const c = ctx();
    await invoke(c);
    // ⚠ Left true, a warm container's idle pool connection holds the invocation open to its timeout.
    expect(c.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  // ⚠ 072 — the pass runs all day. Telling every screen "changed" when nothing did is a refresh
  // timer with extra steps.
  it("announces NOTHING when the pass changed nothing", async () => {
    announceDispatch.mockReset();
    runPass.mockResolvedValue(pass({ collection: kind("collection", { considered: 4, unassigned: 4 }) }));
    await invoke();
    expect(announceDispatch).not.toHaveBeenCalled();
  });

  it("announces to the drivers whose work changed when something was assigned", async () => {
    announceDispatch.mockReset();
    runPass.mockResolvedValue(
      pass({ collection: kind("collection", { considered: 2, assigned: 2 }), driverIds: ["d1"] }),
    );
    await invoke();
    expect(announceDispatch).toHaveBeenCalledWith(["d1"]);
  });

  it("announces when work was only released, or only the reasons changed", async () => {
    announceDispatch.mockReset();
    runPass.mockResolvedValue(pass({ released: 3, driverIds: ["d2"] }));
    await invoke();
    runPass.mockResolvedValue(pass({ reasonsChanged: true }));
    await invoke();
    expect(announceDispatch).toHaveBeenCalledTimes(2);
  });

  it("does nothing further when another pass held the lock", async () => {
    announceDispatch.mockReset();
    runPass.mockResolvedValue(pass({ skipped: "pass_in_progress" }));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(invoke()).resolves.toBeUndefined();
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain("DispatchPackagesAssigned");
    expect(announceDispatch).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ⚠ The alarm target since 072: the run has OPENED and nobody has the package.
  it("reports packages still unassigned after their round has opened", async () => {
    runPass.mockResolvedValue(
      pass({ collection: kind("collection", { considered: 9, unassigned: 9, unassignedPastOpening: 9 }) }),
    );
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(invoke()).resolves.toBeUndefined();
    const emitted = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain('"DispatchUnassignedPastOpening":9');
    spy.mockRestore();
  });

  // ⚠ Ready at 20:00 for tomorrow with nobody on duty is unassigned and is NOT a failure.
  it("does not count packages waiting for a round that has not opened", async () => {
    runPass.mockResolvedValue(pass({ collection: kind("collection", { considered: 9, unassigned: 9 }) }));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await invoke();
    const emitted = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain('"DispatchUnassignedPastOpening":0');
    expect(emitted).not.toContain("DispatchWaveAssignedNothing");
    spy.mockRestore();
  });

  it("emits each metric record with NO dimension (059)", async () => {
    runPass.mockResolvedValue(pass({ collection: kind("collection", { considered: 2, assigned: 2 }) }));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await invoke();
    const emf = spy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("_aws"));
    expect(emf.length).toBeGreaterThan(0);
    // A dimensioned metric is a DIFFERENT metric in CloudWatch; the alarm would go blind.
    for (const record of emf) expect(JSON.parse(record)._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    spy.mockRestore();
  });
});
