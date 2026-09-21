import type { Context, ScheduledEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

const runDuePlanning = vi.hoisted(() => vi.fn());
vi.mock("../planner/service", () => ({ runDuePlanning }));

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

describe("planWavesScheduled — invoked the way AWS invokes it", () => {
  it("runs without touching anything an HTTP event would have carried", async () => {
    runDuePlanning.mockResolvedValue([]);
    await expect(invoke()).resolves.toBeUndefined();
    expect(runDuePlanning).toHaveBeenCalledOnce();
  });

  it("does not wait for the event loop to drain — the pg pool keeps a socket warm", async () => {
    runDuePlanning.mockResolvedValue([]);
    const c = ctx();
    await invoke(c);
    // ⚠ Left true, a warm container's idle pool connection holds the invocation open to its timeout.
    expect(c.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  it("handles a wave that planned nothing, and one that planned something", async () => {
    runDuePlanning.mockResolvedValue([
      { kind: "collection", waveId: null, considered: 0, assigned: 0, unassigned: 0, skippedReason: "nothing_ready" },
      { kind: "delivery", waveId: "w-1", considered: 3, assigned: 3, unassigned: 0, skippedReason: null },
    ]);
    await expect(invoke()).resolves.toBeUndefined();
  });

  // ⚠ The alarm target: considered work, placed none of it.
  it("survives — and reports — a wave that assigned nothing", async () => {
    runDuePlanning.mockResolvedValue([
      { kind: "collection", waveId: "w-2", considered: 9, assigned: 0, unassigned: 9, skippedReason: null },
    ]);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(invoke()).resolves.toBeUndefined();
    const emitted = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain("DispatchWaveAssignedNothing");
    expect(emitted).toContain('"DispatchWaveAssignedNothing":1');
    spy.mockRestore();
  });

  it("emits the metric as its OWN record, never as a dimension (059)", async () => {
    runDuePlanning.mockResolvedValue([
      { kind: "collection", waveId: "w-3", considered: 2, assigned: 2, unassigned: 0, skippedReason: null },
    ]);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await invoke();
    const emf = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("_aws"));
    expect(emf).toBeDefined();
    // A dimensioned metric is a DIFFERENT metric in CloudWatch; the alarm would go blind.
    expect(JSON.parse(emf!)._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    spy.mockRestore();
  });
});
