import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** 101 — the catalogue alarm watches a metric and dimension the shop service really emits (R22). */
const repoRoot = resolve(__dirname, "../../../..");
const tf = readFileSync(resolve(repoRoot, "infra/envs/dev/catalogue-alarms.tf"), "utf8");
const service = readFileSync(resolve(__dirname, "products/service.ts"), "utf8");

describe("catalogue alarms", () => {
  it("watches ProductSubmitRefused{reason=missing_required_details}, which submission emits", () => {
    expect(tf).toMatch(/metric_name\s*=\s*"ProductSubmitRefused"/);
    expect(tf).toMatch(/dimensions\s*=\s*\{\s*reason\s*=\s*"missing_required_details"\s*\}/);
    expect(service).toMatch(/emitMetric\(metricNamespace\(\), "ProductSubmitRefused", 1, \{ reason: "missing_required_details" \}\)/);
  });

  it("is in the namespace the shop service emits to, and goes to the alerts topic", () => {
    expect(tf).toContain('namespace           = "Effy/Edge"');
    expect(readFileSync(resolve(__dirname, "../serverless.yml"), "utf8")).not.toContain("METRIC_NAMESPACE");
    expect(tf).toContain("alarm_actions       = [aws_sns_topic.alerts.arn]");
  });
});
