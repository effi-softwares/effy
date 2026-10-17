import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ EVERY ROUTE THAT MOVES WORK FORWARD MUST CHECK IT IS THE NEXT STEP (093).
 *
 * The order of a driver's work — shops before the hub, the van before a drop, the hub before the next
 * load — is enforced by the gates in `sequence.ts`, not by the app's controls. A new route, or a
 * refactor that drops a call, would work and pass its own tests while letting a stale screen deliver a
 * drop nobody loaded. This reads the routes the service declares and requires each progressing one to
 * call its gate, or to be listed with the reason it has none.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

/** Route → the function that must call a gate, and which gate. */
const GATED: Record<string, { file: string; fn: string; gate: RegExp }> = {
  "POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect": { file: "src/work/complete.ts", fn: "collectStop", gate: /await\s+assertNoDeliveriesOpen\(/ },
  "POST /driver/v1/hub/checkin": { file: "src/work/complete.ts", fn: "hubCheckin", gate: /await\s+assertStopsSettled\(/ },
  "POST /driver/v1/delivery/runs/{runId}/load": { file: "src/work/load.ts", fn: "loadRun", gate: /await\s+assertNothingToHandIn\(/ },
  "POST /driver/v1/delivery/drops/{dropId}/status": { file: "src/work/delivery.ts", fn: "setDropStatus", gate: /await\s+assertDropLoaded\(/ },
  "POST /driver/v1/delivery/drops/{dropId}/proof": { file: "src/proof/repository.ts", fn: "recordProof", gate: /await\s+assertDropLoaded\(/ },
  "POST /driver/v1/delivery/drops/{dropId}/fail": { file: "src/proof/repository.ts", fn: "recordFailure", gate: /await\s+assertDropLoaded\(/ },
};

/** Progressing routes with no sequence gate — each with the reason. */
const UNGATED: Record<string, string> = {
  "POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue": "reporting a package unavailable is information, not a hand-over",
  "POST /driver/v1/delivery/drops/{dropId}/proof/presign": "an upload slot; the proof it is for is gated",
  "POST /driver/v1/delivery/runs/{runId}/return": "returning parcels to the hub is always allowed — it is what the load gate asks for",
};

function declaredRoutes(): string[] {
  const yml = read("serverless.yml");
  const routes: string[] = [];
  const re = /method:\s*([A-Z]+)\s*\n\s*path:\s*(\S+)/g;
  for (let m = re.exec(yml); m !== null; m = re.exec(yml)) routes.push(`${m[1]} ${m[2]}`);
  return routes;
}

function bodyOf(file: string, fn: string): string {
  const src = read(file);
  const start = src.indexOf(`export async function ${fn}(`);
  if (start === -1) return "";
  const next = src.indexOf("\nexport ", start + 1);
  return src
    .slice(start, next === -1 ? undefined : next)
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** A route that moves a stop, drop or package — the paths under collection, hub and delivery. */
const progressing = (r: string) => !r.startsWith("GET ") && /\/driver\/v1\/(collection|hub|delivery)\//.test(r);

describe("every route that moves work forward checks it is the next step (093)", () => {
  const routes = declaredRoutes().filter(progressing);

  it("finds the progressing routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(Object.keys(GATED).length);
  });

  it("accounts for every progressing route — gated, or listed with a reason", () => {
    const unaccounted = routes.filter((r) => !(r in GATED) && !(r in UNGATED));
    expect(unaccounted, "a new progressing route: gate it in sequence.ts, or list it here and say why").toEqual([]);
  });

  for (const [route, { file, fn, gate }] of Object.entries(GATED)) {
    it(`${route} — ${fn} calls its gate`, () => {
      const body = bodyOf(file, fn);
      expect(body, `${fn} was not found in ${file}`).not.toBe("");
      expect(body).toMatch(gate);
    });
  }

  it("the per-drop start is gone: only loading writes out_for_delivery", () => {
    const drop = bodyOf("src/work/delivery.ts", "setDropStatus");
    expect(drop).not.toMatch(/"out_for_delivery"/);
  });
});
