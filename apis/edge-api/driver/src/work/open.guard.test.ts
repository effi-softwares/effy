import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ EVERY ROUTE THAT MOVES A ROUND FORWARD MUST CHECK THAT THE ROUND HAS OPENED (072, FR-023/024).
 *
 * Since 072 a round is on a driver's phone hours before it can be worked. The app disables its
 * controls until then, but a disabled control is a courtesy: the thing that actually stops a van
 * leaving three hours early is `assertRoundOpen` in the service. A NEW route that progresses a round
 * and forgets the call would work, pass every test written for it, and quietly reopen the hole.
 *
 * So this reads the routes the service really declares, and requires each state-changing one to be
 * EITHER listed below with the function that gates it, OR listed as exempt with a reason. A route
 * in neither list fails the build by name.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

/** Route → the function that must call the gate, and the file it lives in. */
const GATED: Record<string, { file: string; fn: string }> = {
  "POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect": { file: "src/work/complete.ts", fn: "collectStop" },
  "POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue": { file: "src/work/complete.ts", fn: "reportIssue" },
  "POST /driver/v1/hub/checkin": { file: "src/work/complete.ts", fn: "hubCheckin" },
  "POST /driver/v1/delivery/drops/{dropId}/status": { file: "src/work/delivery.ts", fn: "setDropStatus" },
  "POST /driver/v1/delivery/drops/{dropId}/proof/presign": { file: "src/proof/service.ts", fn: "presignProof" },
  "POST /driver/v1/delivery/drops/{dropId}/proof": { file: "src/proof/repository.ts", fn: "recordProof" },
  "POST /driver/v1/delivery/drops/{dropId}/fail": { file: "src/proof/repository.ts", fn: "recordFailure" },
};

/** State-changing routes that do not progress a round — each with the reason it is exempt. */
const EXEMPT: Record<string, string> = {
  "POST /driver/v1/duty": "going on or off duty is not work on a round",
  "POST /driver/v1/devices": "registers a push token",
  "DELETE /driver/v1/devices/{token}": "removes a push token",
  "POST /driver/v1/activity/read": "marks the activity feed read",
};

/** Every `METHOD path` the service declares, read from serverless.yml. */
function declaredRoutes(): string[] {
  const yml = read("serverless.yml");
  const routes: string[] = [];
  const re = /method:\s*([A-Z]+)\s*\n\s*path:\s*(\S+)/g;
  for (let m = re.exec(yml); m !== null; m = re.exec(yml)) routes.push(`${m[1]} ${m[2]}`);
  return routes;
}

/** The source of one exported function: from its declaration to the next top-level export. */
function bodyOf(file: string, fn: string): string {
  const src = read(file);
  const start = src.indexOf(`export async function ${fn}(`);
  if (start === -1) return "";
  const next = src.indexOf("\nexport ", start + 1);
  // Comments are stripped so a sentence ABOUT the gate cannot stand in for a call to it.
  return src
    .slice(start, next === -1 ? undefined : next)
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("every route that progresses a round checks that it has opened (072)", () => {
  const routes = declaredRoutes();
  const changing = routes.filter((r) => !r.startsWith("GET "));

  it("finds the service's routes", () => {
    expect(routes.length).toBeGreaterThan(15);
    expect(changing.length).toBeGreaterThanOrEqual(Object.keys(GATED).length);
  });

  it("accounts for every state-changing route — gated, or exempt with a reason", () => {
    const unaccounted = changing.filter((r) => !(r in GATED) && !(r in EXEMPT));
    expect(unaccounted, "a new state-changing route: gate it, or exempt it here and say why").toEqual([]);
  });

  it("lists no route that the service does not declare", () => {
    const stale = [...Object.keys(GATED), ...Object.keys(EXEMPT)].filter((r) => !routes.includes(r));
    expect(stale).toEqual([]);
  });

  for (const [route, { file, fn }] of Object.entries(GATED)) {
    it(`${route} — ${fn} calls the gate`, () => {
      const body = bodyOf(file, fn);
      expect(body, `${fn} was not found in ${file}`).not.toBe("");
      expect(body, `${fn} must call assertRoundOpen or assertStopRoundOpen`).toMatch(
        /await\s+assert(Stop)?RoundOpen\(/,
      );
    });
  }
});
