// Handler tests for the version pair — proves v1 and v2 diverge deliberately over the
// same repository read (spec SC-010) and that failures map to the uniform internal
// problem with the cause kept out of the body.
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/db", () => ({ query: queryMock }));

import { handler as v1 } from "./platform-status-v1-get";
import { handler as v2 } from "./platform-status-v2-get";

function fakeEvent(path: string): APIGatewayProxyEventV2 {
  return { rawPath: path, requestContext: { requestId: "req-1" } } as unknown as APIGatewayProxyEventV2;
}

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

const healthyRow = {
  database_name: "effy",
  database_time: new Date("2026-07-05T12:00:00Z"),
  migration_version: "20260705095817", // BIGINT arrives as a string from pg
  migrations_applied: "1",
};

describe("platform-status v1 + v2 side by side", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [healthyRow] });
  });

  it("v1 serves the flat contract shape", async () => {
    const res = await v1(fakeEvent("/v1/platform/status"), ctx);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;

    expect(res.statusCode).toBe(200);
    expect(body).toEqual({
      environment: expect.any(String) as unknown,
      database_name: "effy",
      database_time: "2026-07-05T12:00:00.000Z",
      migration_version: 20260705095817,
      migrations_applied: 1,
    });
    expect(body).not.toHaveProperty("contract_version");
  });

  it("v2 serves the deliberately reshaped payload over the same read", async () => {
    const res = await v2(fakeEvent("/v2/platform/status"), ctx);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;

    expect(res.statusCode).toBe(200);
    expect(body.contract_version).toBe(2);
    expect(body).not.toHaveProperty("database_name");
    expect(body.database).toMatchObject({
      name: "effy",
      migration: { version: 20260705095817, applied: 1 },
    });
  });

  it("a repository failure is the uniform internal problem, cause withheld", async () => {
    queryMock.mockRejectedValue(new Error('relation "goose_db_version" does not exist'));

    const res = await v1(fakeEvent("/v1/platform/status"), ctx);

    expect(res.statusCode).toBe(500);
    expect(res.headers?.["content-type"]).toBe("application/problem+json");
    expect(res.body).not.toContain("goose_db_version");
  });
});
