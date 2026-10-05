import { afterEach, describe, expect, it, vi } from "vitest";

import { emitMetric } from "./metrics";

function capture(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  fn();
  const line = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  expect(line.endsWith("\n")).toBe(true);
  return JSON.parse(line) as Record<string, unknown>;
}

afterEach(() => vi.restoreAllMocks());

describe("emitMetric", () => {
  it("writes one EMF line with the namespace, metric and dimension set", () => {
    const rec = capture(() => emitMetric("Effy/Commerce", "SlotBookings", 1, { outcome: "held" }));
    const aws = rec._aws as { Timestamp: number; CloudWatchMetrics: Array<Record<string, unknown>> };
    expect(typeof aws.Timestamp).toBe("number");
    expect(aws.CloudWatchMetrics).toEqual([
      { Namespace: "Effy/Commerce", Dimensions: [["outcome"]], Metrics: [{ Name: "SlotBookings", Unit: "Count" }] },
    ]);
    expect(rec.outcome).toBe("held");
    expect(rec.SlotBookings).toBe(1);
  });

  it("defaults to a count of one with no dimensions", () => {
    const rec = capture(() => emitMetric("Effy/Storefront", "ServiceabilityChecks"));
    expect(rec.ServiceabilityChecks).toBe(1);
    const aws = rec._aws as { CloudWatchMetrics: Array<{ Dimensions: string[][] }> };
    expect(aws.CloudWatchMetrics[0]?.Dimensions).toEqual([[]]);
  });

  it("carries nothing but the metric and its dimensions — no service, function or request fields", () => {
    const rec = capture(() => emitMetric("Effy/Commerce", "RefundsIssued", 1, { kind: "item" }));
    expect(Object.keys(rec).sort()).toEqual(["RefundsIssued", "_aws", "kind"]);
  });
});
