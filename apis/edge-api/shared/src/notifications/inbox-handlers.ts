// The five inbox routes (110), one factory for all three audiences, the audience fixed per service so only that
// pool's authorizer can reach them. specs/110-notification-inboxes/contracts/inbox-api.md.
//
//   GET   /{aud}/v1/notifications                list
//   GET   /{aud}/v1/notifications/unseen-count   the bell
//   POST  /{aud}/v1/notifications/seen           { before }  opening the inbox
//   POST  /{aud}/v1/notifications/read-all       { before }  mark all read
//   PATCH /{aud}/v1/notifications/{id}           { archived } archive / undo
//
// Every change tells the person's other screens (`inbox`) once it is done, and corrects their phones' badge (116).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import {
  inboxCategoriesFor,
  type InboxArchiveDTO,
  type InboxCategory,
  type InboxCountDTO,
  type InboxReadAllDTO,
  type NotificationAudience,
} from "@effy/shared-types";

import { type AuthedEvent, subject } from "../lib/claims";
import { json, preamble, refused, unauthenticated, type RequestScope } from "../lib/http";
import { parseJsonBody } from "../validate";
import { announceInbox } from "./announce-inbox";
import { correctBadgesSoon } from "./badge";
import { decodeCursor, INBOX_MAX_PAGE_SIZE, listInbox, markSeen, readAll, setArchived, unseenCount } from "./inbox";
import { isNotificationId } from "./read";

export interface InboxDeps {
  list: typeof listInbox;
  count: typeof unseenCount;
  seen: typeof markSeen;
  readAll: typeof readAll;
  archive: typeof setArchived;
  announce: (audience: NotificationAudience, sub: string) => Promise<void>;
  /** 116: the person's phones get a silent badge correction (never throws). */
  badge: (audience: NotificationAudience, sub: string) => Promise<void>;
}

const DEFAULTS: InboxDeps = {
  list: listInbox,
  count: unseenCount,
  seen: markSeen,
  readAll,
  archive: setArchived,
  announce: (audience, sub) => announceInbox([{ audience, sub }]),
  badge: (audience, sub) => correctBadgesSoon([{ audience, sub }]),
};

type Handler = (event: AuthedEvent, context: Context) => Promise<APIGatewayProxyStructuredResultV2>;

const badQuery = (scope: RequestScope, detail: string) => refused(scope, 400, "invalid_inbox_query", detail);
const badChange = (scope: RequestScope, detail: string) => refused(scope, 400, "invalid_inbox_change", detail);

/** `{ before: ISO }` from the body, kept as the string (microseconds matter), or a refusal. */
function cutoff(event: AuthedEvent, scope: RequestScope): string | APIGatewayProxyStructuredResultV2 {
  const body = parseJsonBody<Record<string, unknown>>(event.body);
  const before = body.value?.before;
  if (body.errors.length > 0 || typeof before !== "string" || Number.isNaN(Date.parse(before))) {
    return badChange(scope, "before must be the ISO time of the newest notification shown");
  }
  return before;
}

export function makeInboxHandlers(audience: NotificationAudience, overrides: Partial<InboxDeps> = {}) {
  const deps: InboxDeps = { ...DEFAULTS, ...overrides };
  const allowed = new Set<string>(inboxCategoriesFor(audience));

  /** Signs the request in and hands the subject on. */
  const authed =
    (fn: (sub: string, event: AuthedEvent, scope: RequestScope) => Promise<APIGatewayProxyStructuredResultV2>): Handler =>
    async (event, context) => {
      const scope = preamble(event, context);
      const sub = subject(event);
      if (!sub) return unauthenticated(scope);
      return fn(sub, event, scope);
    };

  const list = authed(async (sub, event, scope) => {
    const q = event.queryStringParameters ?? {};
    const known = new Set(["filter", "category", "cursor", "limit"]);
    const unknown = Object.keys(q).find((k) => !known.has(k));
    if (unknown) return badQuery(scope, `${unknown} is not an inbox filter`);

    const filter = q.filter ?? "all";
    if (filter !== "all" && filter !== "unread") return badQuery(scope, "filter must be all or unread");

    const category = q.category;
    if (category !== undefined && !allowed.has(category)) {
      return badQuery(scope, allowed.size === 0 ? "this inbox has no categories" : `category must be one of ${[...allowed].join(", ")}`);
    }

    let limit: number | undefined;
    if (q.limit !== undefined) {
      limit = Number(q.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > INBOX_MAX_PAGE_SIZE) {
        return badQuery(scope, `limit must be a whole number from 1 to ${INBOX_MAX_PAGE_SIZE}`);
      }
    }
    if (q.cursor !== undefined && !decodeCursor(q.cursor)) return badQuery(scope, "the cursor is not valid");

    const page = await deps.list(sub, audience, { filter, category: category as InboxCategory | undefined, cursor: q.cursor, limit });
    return json(200, page, scope);
  });

  const count = authed(async (sub, _event, scope) => {
    const body: InboxCountDTO = { unseenCount: await deps.count(sub, audience) };
    return json(200, body, scope);
  });

  const seen = authed(async (sub, event, scope) => {
    const before = cutoff(event, scope);
    if (typeof before !== "string") return before;
    const body: InboxCountDTO = { unseenCount: await deps.seen(sub, audience, before) };
    await deps.announce(audience, sub);
    await deps.badge(audience, sub);
    return json(200, body, scope);
  });

  const all = authed(async (sub, event, scope) => {
    const before = cutoff(event, scope);
    if (typeof before !== "string") return before;
    const body: InboxReadAllDTO = await deps.readAll(sub, audience, before);
    await deps.announce(audience, sub);
    await deps.badge(audience, sub);
    return json(200, body, scope);
  });

  const patch = authed(async (sub, event, scope) => {
    const id = event.pathParameters?.id;
    if (!isNotificationId(id)) return refused(scope, 400, "invalid_notification_id", "the notification id is not valid");
    const body = parseJsonBody<Record<string, unknown>>(event.body);
    const archived = body.value?.archived;
    if (body.errors.length > 0 || typeof archived !== "boolean") return badChange(scope, "archived must be true or false");

    const found = await deps.archive(sub, audience, id, archived);
    // Someone else's, another audience's, or gone: one answer, so nothing confirms an id exists.
    if (!found) return refused(scope, 404, "notification_not_found", "there is no such notification");
    await deps.announce(audience, sub);
    await deps.badge(audience, sub);
    const out: InboxArchiveDTO = { id, archived };
    return json(200, out, scope);
  });

  return { list, unseenCount: count, seen, readAll: all, patch };
}
