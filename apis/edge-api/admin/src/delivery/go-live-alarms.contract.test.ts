import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ 083 — THE GO-LIVE ALARMS WATCH WHAT THE SWEEP EMITS, AND THE SWEEP RUNS. An alarm on a metric
 * name or namespace nobody writes is green forever (070 FR-031).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");
const tf = readFileSync(resolve(repoRoot, "infra/envs/dev/delivery-model-alarms.tf"), "utf8");
const service = readFileSync(resolve(here, "go-live.service.ts"), "utf8");
const yml = readFileSync(resolve(here, "../../serverless.yml"), "utf8");

const alarms = [...tf.matchAll(/resource "aws_cloudwatch_metric_alarm" "(\w+)" \{[\s\S]*?\n\}/g)].map((m) => ({
  name: m[1]!,
  metric: /metric_name\s*=\s*"([^"]+)"/.exec(m[0])?.[1],
  namespace: /namespace\s*=\s*"([^"]+)"/.exec(m[0])?.[1],
  missing: /treat_missing_data\s*=\s*"([^"]+)"/.exec(m[0])?.[1],
  dimensions: /dimensions\s*=/.test(m[0]),
  notifies: /alarm_actions\s*=\s*\[aws_sns_topic\.alerts\.arn\]/.test(m[0]),
}));

describe("083 — going live is alarmed on what the sweep emits", () => {
  it("two alarms, each on a metric the sweep writes, in its namespace, with no dimension", () => {
    expect(alarms.map((a) => [a.name, a.metric]).sort()).toEqual([
      ["delivery_model_switch_blocked", "DeliveryModelSwitchBlocked"],
      ["legacy_orders_open_past_due", "LegacyOrdersOpenPastDue"],
    ]);
    for (const a of alarms) {
      expect(service).toContain(`NAMESPACE = "${a.namespace}"`);
      // ⚠ Emitted with no dimensions: an alarm that names one would watch a series that does not exist.
      expect(service).toMatch(new RegExp(`emitMetric\\(NAMESPACE, "${a.metric}", [^,)]+\\)`));
      expect(a.dimensions).toBe(false);
      expect(a.notifies).toBe(true);
      // No scheduled switch is the ordinary state, and then neither metric is written.
      expect(a.missing).toBe("notBreaching");
    }
  });

  it("the sweep is scheduled every five minutes — inside the ten-minute window it must act in", () => {
    expect(yml).toMatch(/deliveryModelSwitchSweep:\s*\n\s*handler: src\/functions\/delivery-model-switch-sweep\.handler[\s\S]*?- schedule: rate\(5 minutes\)/);
    expect(service).toMatch(/BLOCK_WITHIN_MS = 10 \* 60_000/);
  });
});
