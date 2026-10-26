import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/** 101 — taxonomy reads: any active staff, csa included. Writes: admin or manager. From `admin.staff`, never the claim. */

const shared = vi.hoisted(() => ({ isActiveStaff: vi.fn(), hasStaffRole: vi.fn() }));
vi.mock("@effy/edge-shared", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@effy/edge-shared")), ...shared }));
vi.mock("./service", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./service");
  return Object.fromEntries(Object.keys(actual).map((k) => [k, vi.fn(async () => ({}))]));
});

const ctx = { awsRequestId: "aws-1" } as never;
const ID = "11111111-1111-4111-8111-111111111111";

function event(sub: string | null) {
  return {
    requestContext: { requestId: "req-1", authorizer: sub ? { jwt: { claims: { sub } } } : undefined },
    pathParameters: { id: ID, attributeId: ID },
    queryStringParameters: {},
    headers: {},
    body: "{}",
  } as never;
}

const dir = resolve(__dirname, "../functions");
const files = readdirSync(dir).filter((f) => f.startsWith("taxonomy-") && f.endsWith(".ts") && !f.endsWith(".test.ts"));
const isRead = (f: string) => f.endsWith("-get.ts");

describe("101 — taxonomy authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds all fourteen routes", () => {
    expect(files).toHaveLength(14);
  });

  it("a csa reads every taxonomy GET and is refused every write", async () => {
    shared.isActiveStaff.mockResolvedValue(true);
    shared.hasStaffRole.mockResolvedValue(false);
    for (const f of files) {
      const { handler } = await import(resolve(dir, f));
      const status = (await handler(event("csa-sub"), ctx)).statusCode;
      expect(status, f).toBe(isRead(f) ? 200 : 403);
    }
  });

  it("admin and manager write; nobody without a subject gets anything", async () => {
    shared.isActiveStaff.mockResolvedValue(true);
    shared.hasStaffRole.mockResolvedValue(true);
    for (const f of files) {
      const { handler } = await import(resolve(dir, f));
      expect((await handler(event("admin-sub"), ctx)).statusCode, f).toBeLessThan(300);
      expect((await handler(event(null), ctx)).statusCode, f).toBe(401);
    }
  });
});
