import type { Context } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

import type { AuthedEvent } from "../lib/claims";
import { makeNotificationReadHandler } from "./read-handler";
import type { markRead } from "./read";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;
const ID = "5b0c0000-0000-4000-8000-000000000001";

function event(sub: string | undefined, id?: string): AuthedEvent {
  return {
    rawPath: `/customer/v1/notifications/${id ?? ""}/read`,
    pathParameters: id ? { id } : undefined,
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

describe("POST /{audience}/v1/notifications/{id}/read (109)", () => {
  it("200 with the stored destination for the caller's own notification, asked under the service's audience", async () => {
    const read = vi.fn<typeof markRead>(async () => ({
      notificationId: ID, readAt: "2026-11-07T09:12:03.120Z", destination: { kind: "order", orderId: "o-1" },
    }));
    const res = await makeNotificationReadHandler("customer", read)(event("sub-1", ID), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ notificationId: ID, readAt: "2026-11-07T09:12:03.120Z", destination: { kind: "order", orderId: "o-1" } });
    expect(read).toHaveBeenCalledWith("sub-1", "customer", ID);
  });

  it("404 notification-not-found when it is not the caller's (never 403)", async () => {
    const read = vi.fn<typeof markRead>(async () => null);
    const res = await makeNotificationReadHandler("driver", read)(event("sub-1", ID), ctx);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body!).type).toBe("https://effyshopping.com/problems/notification-not-found");
    expect(read).toHaveBeenCalledWith("sub-1", "driver", ID);
  });

  it("400 for an id that is not a uuid, without touching the database", async () => {
    const read = vi.fn<typeof markRead>();
    const res = await makeNotificationReadHandler("shop", read)(event("sub-1", "not-a-uuid"), ctx);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!).type).toBe("https://effyshopping.com/problems/invalid-notification-id");
    expect(read).not.toHaveBeenCalled();
  });

  it("401 without a subject", async () => {
    const read = vi.fn<typeof markRead>();
    const res = await makeNotificationReadHandler("customer", read)(event(undefined, ID), ctx);
    expect(res.statusCode).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
});
