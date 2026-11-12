import { describe, expect, it } from "vitest";

import { httpRoutes, listStacks } from "../../../../shared/src/lib/serverless-stacks";

/**
 * 115 (analysis I6): the automatic-message routes sit under 112's `/admin/v1/messages…` prefix. HTTP API picks the
 * route with the most literal segments, so `/admin/v1/messages/automations/{id}` beats `/admin/v1/messages/{id}/…`. This
 * holds the paths to that: every automations URL resolves to an automations function, never a message one.
 */
const stack = listStacks().find((s) => s.name === "admin-messages")!;
const routes = httpRoutes(stack);

/** HTTP API's choice among matching routes: the one whose first differing segment is literal (greedy `{x+}` unused here). */
function resolve(method: string, url: string): string | null {
  const parts = url.split("/").filter(Boolean);
  const matching = routes.filter((r) => {
    if (r.method !== method) return false;
    const segs = r.path.split("/").filter(Boolean);
    return segs.length === parts.length && segs.every((s, i) => s.startsWith("{") || s === parts[i]);
  });
  const literalScore = (path: string) => path.split("/").filter(Boolean).map((s) => (s.startsWith("{") ? "0" : "1")).join("");
  matching.sort((a, b) => literalScore(b.path).localeCompare(literalScore(a.path)));
  return matching[0]?.fn ?? null;
}

describe("115 - automatic-message routes never reach a message route", () => {
  const ID = "00000000-0000-4000-8000-000000000000";
  it.each([
    ["GET", "/admin/v1/messages/automations", "automationsListV1"],
    ["POST", "/admin/v1/messages/automations", "automationsCreateV1"],
    ["GET", `/admin/v1/messages/automations/${ID}`, "automationsGetV1"],
    ["PATCH", `/admin/v1/messages/automations/${ID}`, "automationsUpdateV1"],
    ["POST", `/admin/v1/messages/automations/${ID}/state`, "automationsStateV1"],
    ["GET", `/admin/v1/messages/automations/${ID}/activity`, "automationsActivityV1"],
  ])("%s %s → %s", (method, url, fn) => {
    expect(resolve(method, url)).toBe(fn);
  });

  it("112's routes still answer their own paths", () => {
    expect(resolve("GET", `/admin/v1/messages/${ID}`)).toBe("messagesGetV1");
    expect(resolve("GET", `/admin/v1/messages/${ID}/activity`)).toBe("messagesActivityV1");
  });

  it("every automations route carries the back-office authorizer", () => {
    const own = routes.filter((r) => r.path.startsWith("/admin/v1/messages/automations"));
    expect(own).toHaveLength(6);
    for (const r of own) expect(r.authorizerParam).toMatch(/back-office_id/);
  });
});
