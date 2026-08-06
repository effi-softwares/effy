import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emit } from "./observability";

/**
 * ⚠ THE ALARM ↔ METRIC CONTRACT — the gap that made 035's sign-in alarms unable to fire.
 *
 * WHAT HAPPENED (2026-08-06). The auth service failed EVERY code send for hours with
 * `AccessDeniedException`. Seven failures were recorded on the customer pool alone. Sign-in was
 * impossible on all four audiences — and `effy-dev-otp-send-failures`, whose own description reads
 * "a failed send IS a failed sign-in", stayed at **OK** the entire time, reporting "no datapoints
 * were received".
 *
 * WHY. In CloudWatch EMF, **each dimension set defines a separate metric**. The emitter published
 * only `[["userPoolId"]]`, so `Effy/Auth otp_send_failed` *with no dimensions* never existed. Every
 * alarm in `infra/envs/dev/otp-store.tf` names namespace + metric and **no dimensions**, so each
 * was watching a metric that is never published. They could not fire under any circumstances.
 *
 * ⚠ NEITHER SIDE IS WRONG ON ITS OWN, WHICH IS WHY NOTHING CAUGHT IT. The emitter is a correct
 * emitter. The alarms are correct alarms. The defect exists only in the relationship between them,
 * and no unit test on either side of the boundary can see it — the same shape as 027's R13
 * (Kotlin and Go each correct, the wire between them wrong) and 035's audience-map gap (code and
 * tests each correct, the deployment silent).
 *
 * So this test reads the ACTUAL Terraform and the ACTUAL emitter and asserts they agree.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

function captureEmf(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  fn();
  const raw = spy.mock.calls[0]?.[0];
  expect(typeof raw, "emit() wrote nothing to stdout").toBe("string");
  return JSON.parse(raw as string) as Record<string, unknown>;
}

type EmfPayload = {
  _aws: {
    CloudWatchMetrics: { Namespace: string; Dimensions: string[][]; Metrics: { Name: string }[] }[];
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EMF metric emission", () => {
  it("publishes the per-pool dimension set — which audience is broken", () => {
    const payload = captureEmf(() => emit("otp_send_failed", "ap-southeast-2_TEST")) as EmfPayload;
    const sets = payload._aws.CloudWatchMetrics[0]?.Dimensions ?? [];

    expect(sets).toContainEqual(["userPoolId"]);
    expect((payload as unknown as Record<string, unknown>).userPoolId).toBe("ap-southeast-2_TEST");
  });

  it("⚠ ALSO publishes the dimensionless aggregate — without it no alarm can fire", () => {
    const payload = captureEmf(() => emit("otp_send_failed", "ap-southeast-2_TEST")) as EmfPayload;
    const sets = payload._aws.CloudWatchMetrics[0]?.Dimensions ?? [];

    expect(
      sets.some((s) => s.length === 0),
      "an empty dimension set is what publishes the metric the alarms watch",
    ).toBe(true);
  });

  it("names the namespace the alarms name", () => {
    const payload = captureEmf(() => emit("otp_code_issued", "ap-southeast-2_TEST")) as EmfPayload;
    expect(payload._aws.CloudWatchMetrics[0]?.Namespace).toBe("Effy/Auth");
  });
});

describe("⚠ every Effy/Auth alarm watches a metric this service actually publishes", () => {
  // Parsing Terraform crudely and on purpose: an HCL parser would be a dependency, and the shape
  // here is fixed and reviewed. Each `resource "aws_cloudwatch_metric_alarm"` block is taken whole.
  function alarmBlocks(): { name: string; body: string }[] {
    const tf = readFileSync(resolve(repoRoot, "infra/envs/dev/otp-store.tf"), "utf8");
    const blocks: { name: string; body: string }[] = [];
    const re = /resource\s+"aws_cloudwatch_metric_alarm"\s+"([a-z0-9_]+)"\s*\{/g;

    for (const m of tf.matchAll(re)) {
      const start = m.index + m[0].length;
      const end = tf.indexOf("\n}", start);
      blocks.push({ name: m[1] ?? "", body: tf.slice(start, end < 0 ? undefined : end) });
    }
    return blocks;
  }

  const publishedSets = (() => {
    const payload = captureEmf(() => emit("otp_send_failed", "pool")) as EmfPayload;
    vi.restoreAllMocks();
    return payload._aws.CloudWatchMetrics[0]?.Dimensions ?? [];
  })();

  const authAlarms = alarmBlocks().filter((b) => /namespace\s*=\s*"Effy\/Auth"/.test(b.body));

  it("finds the alarms (guard: a rename must not make this suite vacuous)", () => {
    expect(authAlarms.length).toBeGreaterThanOrEqual(4);
  });

  for (const alarm of authAlarms) {
    it(`${alarm.name} — its dimension set is published`, () => {
      const declared = /dimensions\s*=\s*\{([^}]*)\}/.exec(alarm.body);

      if (!declared) {
        // No dimensions declared → it watches the aggregate, which must therefore be published.
        expect(
          publishedSets.some((s) => s.length === 0),
          `${alarm.name} declares no dimensions, so the emitter MUST publish an empty dimension ` +
            `set — otherwise this alarm can never leave OK, no matter what breaks`,
        ).toBe(true);
        return;
      }

      // Dimensions declared → some published set must match those keys exactly.
      const keys = [...(declared[1] ?? "").matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g)]
        .map((m) => m[1] as string)
        .sort();

      expect(
        publishedSets.some((s) => [...s].sort().join(",") === keys.join(",")),
        `${alarm.name} watches dimensions [${keys.join(", ")}], which this service never publishes`,
      ).toBe(true);
    });
  }
});
