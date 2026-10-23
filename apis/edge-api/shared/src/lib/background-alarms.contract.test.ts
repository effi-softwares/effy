import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { functionsOf, listStacks } from "./serverless-stacks.js";

/**
 * Every scheduled function has an alarm on its failed invocations (background-functions.tf), which
 * names it in another file: every alarm names a real scheduled function, and every scheduled function
 * has an alarm.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");
const infra = resolve(edgeApi, "../../infra/envs/dev");

/** Through `listStacks`, so a scheduled function in a second stack file is not missed. */
function scheduledFunctions(): { service: string; key: string; name: string }[] {
  return listStacks().flatMap((stack) =>
    functionsOf(stack)
      .filter((f) => f.scheduled)
      .map((f) => ({ service: stack.service, key: f.key, name: `${stack.service}-dev-${f.key}` })),
  );
}

const tf = readFileSync(resolve(infra, "background-functions.tf"), "utf8");
const alarmed = [...tf.matchAll(/function\s*=\s*"(effy-edge-[a-z-]+?)-\$\{var\.env\}-(\w+)"/g)].map((m) => `${m[1]}-dev-${m[2]}`);

/** Watched by a wired error alarm declared elsewhere; each says where. */
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
