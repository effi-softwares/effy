import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ EVERY SCHEDULED FUNCTION HAS AN ALARM THAT DOES NOT DEPEND ON ITS OWN CODE RUNNING.
 *
 * A scheduled function is watched by what it is for — a refund left stuck, a wave that placed
 * nothing — and every one of those signals is emitted BY the function. If it throws first, it emits
 * nothing, "no data" reads as healthy, and the work stops with every alarm green. So each has an
 * alarm on the platform's own count of failed invocations (`infra/envs/dev/background-functions.tf`).
 *
 * That alarm addresses the function BY NAME, in a different file, in a different language. Rename
 * the function and the alarm keeps watching a name that no longer exists — nothing fails, nothing
 * warns. This holds the two to each other, in both directions:
 *
 *   · every alarm names a function that exists and really is scheduled;
 *   · every scheduled function has an alarm — here, or one of its own that notifies.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");
const infra = resolve(edgeApi, "../../infra/envs/dev");

/** `<service>/serverless.yml` → the keys of its functions that have a `schedule` event. */
function scheduledFunctions(): { service: string; key: string; name: string }[] {
  const out: { service: string; key: string; name: string }[] = [];
  for (const dir of readdirSync(edgeApi)) {
    let yml: string;
    try {
      yml = readFileSync(resolve(edgeApi, dir, "serverless.yml"), "utf8");
    } catch {
      continue; // not a deployed service (shared, ops)
    }
    const service = /^service: (\S+)$/m.exec(yml)?.[1];
    if (!service) throw new Error(`${dir}/serverless.yml names no service`);
    const start = yml.indexOf("\nfunctions:");
    const end = yml.indexOf("\nresources:", start);
    const functions = yml.slice(start, end < 0 ? undefined : end);
    const keys = [...functions.matchAll(/\n {2}([A-Za-z]\w*):\n/g)];
    keys.forEach((m, i) => {
      const body = functions.slice(m.index, keys[i + 1]?.index);
      if (/\n\s+handler:/.test(body) && /-\s+schedule\b/.test(body)) out.push({ service, key: m[1]!, name: `${service}-dev-${m[1]}` });
    });
  }
  return out;
}

const tf = readFileSync(resolve(infra, "background-functions.tf"), "utf8");
const alarmed = [...tf.matchAll(/function\s*=\s*"(effy-edge-[a-z]+)-\$\{var\.env\}-(\w+)"/g)].map((m) => `${m[1]}-dev-${m[2]}`);

/** Scheduled functions watched by a wired error alarm declared somewhere else. Each says where. */
const ALARMED_ELSEWHERE: Record<string, string> = {
  "effy-edge-shop-dev-insightsRollup": "infra/envs/dev/insights.tf — insights_rollup_errors",
  "effy-edge-admin-dev-sesIdentityHealth": "apis/edge-api/admin/serverless.yml — SesIdentityHealthErrorsAlarm",
};

describe("scheduled functions and their failure alarms", () => {
  const scheduled = scheduledFunctions();

  it("found the schedules and the alarms", () => {
    expect(scheduled.length).toBeGreaterThanOrEqual(8);
    expect(alarmed.length).toBeGreaterThanOrEqual(7);
    expect(new Set(alarmed).size).toBe(alarmed.length);
  });

  it.each(alarmed)("%s — the alarm names a function that exists and is scheduled", (name) => {
    expect(scheduled.map((s) => s.name), `${name} is alarmed but no service schedules a function by that name — was it renamed?`).toContain(name);
  });

  it("every scheduled function has a failure alarm", () => {
    const unwatched = scheduled.map((s) => s.name).filter((n) => !alarmed.includes(n) && !(n in ALARMED_ELSEWHERE));
    expect(unwatched, `scheduled with no failure alarm — add it to infra/envs/dev/background-functions.tf:\n  ${unwatched.join("\n  ")}`).toEqual([]);
  });

  it("the exemptions are real: each names an alarm that exists, with an action", () => {
    for (const [name, where] of Object.entries(ALARMED_ELSEWHERE)) {
      expect(scheduled.map((s) => s.name), `${name} is exempted but is not a scheduled function any more`).toContain(name);
      const [file, alarm] = where.split(" — ") as [string, string];
      const src = readFileSync(resolve(edgeApi, "../..", file), "utf8");
      const at = src.indexOf(alarm);
      expect(at, `${where} not found`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 1400)).toMatch(/alarm_actions|AlarmActions/);
    }
  });

  it("every alarm here notifies, and none pages on recovery", () => {
    expect(tf).toContain("alarm_actions       = [aws_sns_topic.alerts.arn]");
    expect(tf.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n")).not.toContain("ok_actions");
  });
});
