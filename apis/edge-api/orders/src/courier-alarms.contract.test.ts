import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ 080 — THE COURIER ALARMS WATCH WHAT THE SWEEP EMITS, AND THE SWEEP RUNS. An alarm on a metric
 * name, namespace or dimension value nobody writes is green forever (070 FR-031).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const tf = readFileSync(resolve(repoRoot, "infra/envs/dev/courier-alarms.tf"), "utf8");
const sweep = readFileSync(resolve(here, "functions/courier-late-sweep.ts"), "utf8");
const yml = readFileSync(resolve(here, "../serverless.yml"), "utf8");

describe("080 — late courier parcels are alarmed on what is emitted", () => {
  it("the metric, namespace and every alarmed place are the sweep's", () => {
    expect(tf).toMatch(/metric_name\s*=\s*"CourierParcelsLate"/);
    expect(sweep).toMatch(/emitMetric\(NAMESPACE, "CourierParcelsLate"/);
    const namespace = /namespace\s*=\s*"([^"]+)"/.exec(tf)?.[1];
    expect(sweep).toContain(`NAMESPACE = "${namespace}"`);
    const places = [...tf.matchAll(/^\s{4}(\w+)\s+= "080/gm)].map((m) => m[1]);
    expect(places.sort()).toEqual(["hub", "supplier"]);
    for (const p of places) expect(sweep).toContain(`"${p}"`);
    expect(tf).toMatch(/dimensions\s*=\s*\{ where = each\.key \}/);
  });

  it("the sweep is scheduled, and a stopped sweep is an alarm", () => {
    expect(yml).toMatch(/courierLateSweep:\s*\n\s*handler: src\/functions\/courier-late-sweep\.handler[\s\S]*?- schedule: rate\(30 minutes\)/);
    expect(tf).toMatch(/treat_missing_data\s*=\s*"breaching"/);
  });
});
