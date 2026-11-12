// The two public routes behind the unsubscribe link in a marketing email (115 US2; contracts/routes.md), built here so
// the customer service's functions are one line each. No authorizer: the token is the credential.
//
//   POST /customer/v1/email-unsubscribe        { token, messageId? }, or ?t=…&m=… (RFC 8058 one-click)
//   POST /customer/v1/email-unsubscribe/undo   { token }
//
// Always 200 and the same shape, so a wrong token reveals nothing. The switches and consent record are written by
// preferences.ts only; this module resolves the token and answers.
import type { EmailUnsubscribeResponse } from "@effy/shared-types";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { pooled, withTransaction, type Queryable } from "../../lib/db";
import { json, preamble } from "../../lib/http";
import { emitMetric, metricNamespace } from "../../lib/metrics";
import { parseJsonBody } from "../../validate";
import { emailUnsubscribeUndoable, undoEmailUnsubscribe, unsubscribeFromEmail } from "../preferences";
import { customerForToken } from "./unsubscribe";

type Handler = (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyStructuredResultV2>;

export interface UnsubscribeDeps {
  db: Queryable;
  transact: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
}

const DEFAULTS: UnsubscribeDeps = { db: pooled, transact: withTransaction };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the request carries: the one-click form puts the token in the address, the website page in the body. */
export function unsubscribeRequestOf(event: Pick<APIGatewayProxyEventV2, "queryStringParameters" | "body" | "isBase64Encoded">): {
  token: unknown;
  messageId: string | null;
  via: "email_link" | "one_click";
} {
  const q = event.queryStringParameters ?? {};
  if (q.t) return { token: q.t, messageId: q.m && UUID.test(q.m) ? q.m : null, via: "one_click" };
  const raw = event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const body = parseJsonBody<Record<string, unknown>>(raw);
  const v = body.errors.length === 0 && body.value && typeof body.value === "object" ? body.value : {};
  const messageId = typeof v.messageId === "string" && UUID.test(v.messageId) ? v.messageId : null;
  return { token: v.token, messageId, via: "email_link" };
}

export function makeUnsubscribeHandlers(overrides: Partial<UnsubscribeDeps> = {}) {
  const deps: UnsubscribeDeps = { ...DEFAULTS, ...overrides };

  const unsubscribe: Handler = async (event, context) => {
    const scope = preamble(event, context);
    const req = unsubscribeRequestOf(event);
    const result = await deps.transact(async (tx): Promise<EmailUnsubscribeResponse> => {
      const customerId = await customerForToken(tx, req.token);
      if (!customerId) return { ok: false, undoable: false };
      await unsubscribeFromEmail(tx, customerId, req.messageId, req.via);
      return { ok: true, undoable: await emailUnsubscribeUndoable(tx, customerId) };
    });
    if (result.ok) emitMetric(metricNamespace(), "EmailUnsubscribes", 1, { source: req.via });
    scope.log.info({ msg: "email.unsubscribe", ok: result.ok, via: req.via }, "email unsubscribe handled");
    return json(200, result, scope);
  };

  const undo: Handler = async (event, context) => {
    const scope = preamble(event, context);
    const { token } = unsubscribeRequestOf({ ...event, queryStringParameters: undefined });
    const ok = await deps.transact(async (tx) => {
      const customerId = await customerForToken(tx, token);
      return customerId ? undoEmailUnsubscribe(tx, customerId) : false;
    });
    if (ok) emitMetric(metricNamespace(), "EmailUnsubscribeUndos", 1);
    scope.log.info({ msg: "email.unsubscribe.undo", ok }, "email unsubscribe undo handled");
    return json(200, { ok }, scope);
  };

  return { unsubscribe, undo };
}
