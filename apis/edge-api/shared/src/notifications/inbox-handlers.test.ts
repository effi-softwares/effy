import type { Context } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

import type { AuthedEvent } from "../lib/claims";
import { encodeCursor } from "./inbox";
import { makeInboxHandlers, type InboxDeps } from "./inbox-handlers";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;
const ID = "5b0c0000-0000-4000-8000-000000000001";
const PAGE = { pinned: [], items: [], nextCursor: null, categories: [], unseenCount: 0 };

function event(opts: { sub?: string; query?: Record<string, string>; body?: unknown; id?: string } = {}): AuthedEvent {
  return {
    rawPath: "/x/v1/notifications",
    queryStringParameters: opts.query,
    pathParameters: opts.id ? { id: opts.id } : undefined,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: opts.sub === undefined ? { sub: "sub-1" } : opts.sub ? { sub: opts.sub } : {} } } },
  } as unknown as AuthedEvent;
}

function deps(): InboxDeps & { [K in keyof InboxDeps]: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async () => PAGE),
    count: vi.fn(async () => 4),
    seen: vi.fn(async () => 0),
    readAll: vi.fn(async () => ({ updated: 3, unseenCount: 0 })),
    archive: vi.fn(async () => true),
    announce: vi.fn(async () => undefined),
    badge: vi.fn(async () => undefined),
  } as never;
}

const problemCode = (body: string | undefined) => (JSON.parse(body!).type as string).split("/").pop();

describe("inbox routes (110)", () => {
  it("401 without a subject, on every route", async () => {
    const h = makeInboxHandlers("customer", deps());
    for (const route of [h.list, h.unseenCount, h.seen, h.readAll, h.patch]) {
      expect((await route(event({ sub: "" }), ctx)).statusCode).toBe(401);
    }
  });

  it("lists with the service's audience and the caller's filters", async () => {
    const d = deps();
    const cursor = encodeCursor("2026-11-08T09:12:44.123456Z", ID);
    const res = await makeInboxHandlers("shop", d).list(event({ query: { filter: "unread", category: "stock", cursor, limit: "20" } }), ctx);
    expect(res.statusCode).toBe(200);
    expect(d.list).toHaveBeenCalledWith("sub-1", "shop", { filter: "unread", category: "stock", cursor, limit: 20 });
  });

  it.each([
    ["customer", { category: "stock" }],
    ["shop", { category: "points" }],
    ["driver", { category: "work" }],
    ["customer", { filter: "read" }],
    ["customer", { limit: "0" }],
    ["customer", { limit: "51" }],
    ["customer", { cursor: "not-a-cursor" }],
    ["customer", { sort: "oldest" }],
  ] as const)("%s refuses %o with 400 invalid_inbox_query", async (audience, query) => {
    const d = deps();
    const res = await makeInboxHandlers(audience, d).list(event({ query: query as Record<string, string> }), ctx);
    expect(res.statusCode).toBe(400);
    expect(problemCode(res.body)).toBe("invalid-inbox-query");
    expect(d.list).not.toHaveBeenCalled();
  });

  it("the count", async () => {
    const res = await makeInboxHandlers("driver", deps()).unseenCount(event(), ctx);
    expect(JSON.parse(res.body!)).toEqual({ unseenCount: 4 });
  });

  it("seen and read-all take the cut-off and tell the person's other screens", async () => {
    const d = deps();
    const h = makeInboxHandlers("customer", d);
    const before = "2026-11-08T09:12:44.123Z";

    expect(JSON.parse((await h.seen(event({ body: { before } }), ctx)).body!)).toEqual({ unseenCount: 0 });
    expect(d.seen).toHaveBeenCalledWith("sub-1", "customer", before);

    expect(JSON.parse((await h.readAll(event({ body: { before } }), ctx)).body!)).toEqual({ updated: 3, unseenCount: 0 });
    expect(d.readAll).toHaveBeenCalledWith("sub-1", "customer", before);
    expect(d.announce).toHaveBeenCalledTimes(2);
    expect(d.announce).toHaveBeenCalledWith("customer", "sub-1");
  });

  it.each([undefined, {}, { before: "yesterday" }, { before: 7 }])("seen refuses a body of %o", async (body) => {
    const d = deps();
    const res = await makeInboxHandlers("customer", d).seen(event({ body }), ctx);
    expect(res.statusCode).toBe(400);
    expect(d.seen).not.toHaveBeenCalled();
    expect(d.announce).not.toHaveBeenCalled();
  });

  it("archive and undo", async () => {
    const d = deps();
    const h = makeInboxHandlers("shop", d);
    expect(JSON.parse((await h.patch(event({ id: ID, body: { archived: true } }), ctx)).body!)).toEqual({ id: ID, archived: true });
    expect(JSON.parse((await h.patch(event({ id: ID, body: { archived: false } }), ctx)).body!)).toEqual({ id: ID, archived: false });
    expect(d.archive).toHaveBeenNthCalledWith(1, "sub-1", "shop", ID, true);
    expect(d.archive).toHaveBeenNthCalledWith(2, "sub-1", "shop", ID, false);
    expect(d.announce).toHaveBeenCalledTimes(2);
  });

  it("404 when it is not the caller's (never 403), and nothing is announced", async () => {
    const d = deps();
    d.archive.mockResolvedValueOnce(false);
    const res = await makeInboxHandlers("customer", d).patch(event({ id: ID, body: { archived: true } }), ctx);
    expect(res.statusCode).toBe(404);
    expect(problemCode(res.body)).toBe("notification-not-found");
    expect(d.announce).not.toHaveBeenCalled();
  });

  it("400 for a bad id or a bad change", async () => {
    const h = makeInboxHandlers("customer", deps());
    expect((await h.patch(event({ id: "nope", body: { archived: true } }), ctx)).statusCode).toBe(400);
    expect((await h.patch(event({ id: ID, body: { archived: "yes" } }), ctx)).statusCode).toBe(400);
  });

  it("116: every change corrects the person's phones' badge; a refused one does not", async () => {
    const d = deps();
    const h = makeInboxHandlers("customer", d);
    const before = "2026-11-12T09:00:00.000000Z";
    await h.seen(event({ body: { before } }), ctx);
    await h.readAll(event({ body: { before } }), ctx);
    await h.patch(event({ id: ID, body: { archived: true } }), ctx);
    expect(d.badge).toHaveBeenCalledTimes(3);
    expect(d.badge).toHaveBeenCalledWith("customer", "sub-1");
    d.archive.mockResolvedValueOnce(false);
    await h.patch(event({ id: ID, body: { archived: true } }), ctx);
    expect(d.badge).toHaveBeenCalledTimes(3);
  });
});
