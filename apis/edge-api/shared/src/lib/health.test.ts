import { beforeEach, describe, expect, it, vi } from "vitest";

import { livenessHandler, readinessHandler } from "./health";

const pingDatabase = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ pingDatabase }));

const event = {
  requestContext: { requestId: "req-1" },
  headers: {},
} as never;

const context = { callbackWaitsForEmptyEventLoop: true, awsRequestId: "aws-1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("livenessHandler", () => {
  it("is 200 and names the service", async () => {
    const res = await livenessHandler("admin")(event, context);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ status: "ok", service: "admin" });
  });

  // The whole point of liveness: it answers even when everything it depends on is broken. If it
  // ever touched the database, it would report "down" for a fault that is not its own — which is
  // precisely the confusion the healthz/readyz split exists to remove.
  it("does NOT touch the database — that is what makes it a liveness probe", async () => {
    pingDatabase.mockRejectedValue(new Error("database is on fire"));

    const res = await livenessHandler("shop")(event, context);

    expect(res.statusCode).toBe(200);
    expect(pingDatabase).not.toHaveBeenCalled();
  });
});

describe("readinessHandler", () => {
  it("is 200 when the database answers", async () => {
    pingDatabase.mockResolvedValue(undefined);

    const res = await readinessHandler("admin")(event, context);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      status: "ready",
      service: "admin",
      checks: { database: "ok" },
    });
    expect(pingDatabase).toHaveBeenCalledOnce();
  });

  it("is 503 — not 500 — when the database is unreachable", async () => {
    pingDatabase.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await readinessHandler("shop")(event, context);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body as string)).toEqual({
      status: "unavailable",
      service: "shop",
      checks: { database: "unreachable" },
    });
  });

  // The body is public and unauthenticated. A driver error leaks hosts, ports, and sometimes
  // credentials — so it is logged, never returned.
  it("never leaks the underlying error into the public body", async () => {
    pingDatabase.mockRejectedValue(
      new Error("connect ECONNREFUSED effy-dev-db.abc123.ap-southeast-2.rds.amazonaws.com:5432"),
    );

    const res = await readinessHandler("admin")(event, context);

    expect(res.body).not.toContain("rds.amazonaws.com");
    expect(res.body).not.toContain("ECONNREFUSED");
    expect(res.body).not.toContain("5432");
  });
});
