import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Every alarm watches a metric name and dimension value the source actually emits; otherwise it is green forever. */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const tf = readFileSync(resolve(repoRoot, "infra/envs/dev/commerce-alarms.tf"), "utf8");

function sources(dir: string): string {
  return readdirSync(dir)
    .flatMap((e) => {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) return [sources(full)];
      return /\.ts$/.test(e) && !/\.test\.ts$/.test(e) ? [readFileSync(full, "utf8")] : [];
    })
    .join("\n");
}
// This service plus the shared money and delivery code it bundles.
const emitted = [sources(here), sources(resolve(repoRoot, "apis/edge-api/shared/src")), sources(resolve(repoRoot, "apis/edge-api/shop/src/functions"))].join("\n");

/** `{ metric = "X" dimensions = { k = "v" } }` from the locals map, plus the metric_query blocks. */
function alarmedMetrics(): { metric: string; dimensions: Record<string, string> }[] {
  const out: { metric: string; dimensions: Record<string, string> }[] = [];
  const dims = (body: string) => Object.fromEntries([...body.matchAll(/(\w+)\s*=\s*"([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
  for (const m of tf.matchAll(/metric\s*=\s*"(\w+)"\s*\n\s*dimensions\s*=\s*\{([^}]*)\}/g)) out.push({ metric: m[1]!, dimensions: dims(m[2]!) });
  for (const m of tf.matchAll(/metric_name\s*=\s*"(\w+)"\s*\n\s*dimensions\s*=\s*\{([^}]*)\}/g)) out.push({ metric: m[1]!, dimensions: dims(m[2]!) });
  return out;
}

describe("the commerce alarms watch what the code emits", () => {
  const alarms = alarmedMetrics();

  it("found the alarms - eleven conditions over twelve series", () => {
    expect(alarms.map((a) => a.metric).sort()).toEqual([
      "DeliveryQuoteFailures", "EffyWindowsNoneDefined", "PointsHoldShortfall", "PointsInvariantViolations", "RefundOutcomes", "RefundSubmitFailures",
      "RefundSubmitFailures", "RefundsStuck", "SlotBookings", "StockBlocked",
      "TaxInvoiceRequestedWhileDisabled",
      "WebhookFailures",
    ]);
    // Ten in the map plus the two-series one.
    expect((tf.match(/^ {4}[a-z-]+ = \{$/gm) ?? []).length + (tf.match(/resource "aws_cloudwatch_metric_alarm" "commerce_refund_submit_failures"/g) ?? []).length).toBe(11);
  });

  it.each(alarms)("$metric $dimensions is emitted", ({ metric, dimensions }) => {
    expect(emitted, `nothing emits "${metric}"`).toMatch(new RegExp(`emitMetric\\([\\w.]+(?:\\(\\))?,\\s*"${metric}"`));
    for (const [key, value] of Object.entries(dimensions)) {
      expect(emitted, `"${metric}" is never emitted with a "${key}" dimension`).toMatch(new RegExp(`"${metric}"[^\\n]*\\b${key}\\b|"${metric}"[\\s\\S]{0,160}\\b${key}\\b`));
      expect(emitted, `nothing produces ${key}="${value}"`).toContain(`"${value}"`);
    }
  });

  it("a metric alarmed with NO dimensions is emitted with none", () => {
    for (const { metric } of alarms.filter((a) => Object.keys(a.dimensions).length === 0)) {
      expect(emitted, `"${metric}" must have an emission with no dimensions, or its alarm matches no series`).toMatch(
        new RegExp(`emitMetric\\([^,]+,\\s*"${metric}"\\s*(\\)|,\\s*[\\w.]+\\s*(\\)|,\\s*\\{\\s*\\}\\s*\\)))`),
      );
    }
  });

  it("every alarm reaches a person, and a quiet platform does not page", () => {
    const resources = tf.split(/^resource /m).slice(1);
    expect(resources).toHaveLength(2);
    for (const r of resources) {
      expect(r).toContain("alarm_actions       = [aws_sns_topic.alerts.arn]");
      expect(r).toContain('treat_missing_data  = "notBreaching"');
    }
    expect(tf).toContain('commerce_metric_namespace = "Effy/Commerce"');
    // No address here: the topic's subscriber is set elsewhere.
    expect(tf).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
