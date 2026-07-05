import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { describe, expect, it } from "vitest";

import { internal, json, preamble, problem, ProblemType } from "./http";

function fakeEvent(path = "/v1/platform/status"): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: { requestId: "gw-req-42" },
  } as unknown as APIGatewayProxyEventV2;
}

function fakeContext(): Context {
  return {
    awsRequestId: "lambda-req-7",
    callbackWaitsForEmptyEventLoop: true,
  } as unknown as Context;
}

describe("preamble", () => {
  it("disables callbackWaitsForEmptyEventLoop — the cached-socket hang guard", () => {
    const ctx = fakeContext();
    preamble(fakeEvent(), ctx);
    expect(ctx.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  it("captures the gateway request id and instance path", () => {
    const scope = preamble(fakeEvent("/v2/platform/status"), fakeContext());
    expect(scope.requestId).toBe("gw-req-42");
    expect(scope.instance).toBe("/v2/platform/status");
  });
});

describe("responses", () => {
  const scope = preamble(fakeEvent(), fakeContext());

  it("json echoes x-request-id for cross-log correlation", () => {
    const res = json(200, { ok: true }, scope);
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["x-request-id"]).toBe("gw-req-42");
    expect(res.headers?.["content-type"]).toBe("application/json");
  });

  it("problem conforms to the error-envelope contract", () => {
    const res = problem(403, ProblemType.Forbidden, "Insufficient permissions", "nope", scope);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;

    expect(res.headers?.["content-type"]).toBe("application/problem+json");
    expect(body).toMatchObject({
      type: ProblemType.Forbidden,
      title: "Insufficient permissions",
      status: 403,
      instance: "/v1/platform/status",
      request_id: "gw-req-42",
    });
  });

  it("internal never leaks a cause (conformance test 3)", () => {
    const res = internal(scope);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("stack");
    expect(res.body).toContain(ProblemType.Internal);
  });
});
