// The customer's notification preferences routes (111), built here like the inbox routes so the customer service's
// functions are one line each. specs/111-notification-preferences/contracts/preferences-api.md.
//
//   GET   /customer/v1/notification-preferences   choices, consent, the offers ask
//   PATCH /customer/v1/notification-preferences   { surface, via?, changes?, consent?, wordingVersion? } - all or nothing
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { type AuthedEvent, subject } from "../lib/claims";
import { pooled, withTransaction, type Queryable } from "../lib/db";
import { json, preamble, refused, unauthenticated, type RequestScope } from "../lib/http";
import { parseJsonBody } from "../validate";
import { applyPreferencesChange, customerIdForSub, parsePreferencesChange, preferencesFor, PreferencesRefused } from "./preferences";

type Handler = (event: AuthedEvent, context: Context) => Promise<APIGatewayProxyStructuredResultV2>;

export interface PreferencesDeps {
  db: Queryable;
  transact: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
}

const DEFAULTS: PreferencesDeps = { db: pooled, transact: withTransaction };

const noCustomer = (scope: RequestScope) => refused(scope, 404, "customer_not_found", "there is no customer profile for this sign-in");

export function makePreferencesHandlers(overrides: Partial<PreferencesDeps> = {}) {
  const deps: PreferencesDeps = { ...DEFAULTS, ...overrides };

  const get: Handler = async (event, context) => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) return unauthenticated(scope);
    const customerId = await customerIdForSub(deps.db, sub);
    if (!customerId) return noCustomer(scope);
    return json(200, await preferencesFor(deps.db, customerId), scope);
  };

  const patch: Handler = async (event, context) => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) return unauthenticated(scope);
    const body = parseJsonBody<Record<string, unknown>>(event.body);
    if (body.errors.length > 0) return refused(scope, 400, "invalid_preferences_change", "the body is not valid JSON");
    let change;
    try {
      change = parsePreferencesChange(body.value);
    } catch (err) {
      if (err instanceof PreferencesRefused) return refused(scope, err.status, err.code, err.message);
      throw err;
    }
    const result = await deps.transact(async (tx) => {
      const customerId = await customerIdForSub(tx, sub);
      if (!customerId) return null;
      await applyPreferencesChange(tx, customerId, change);
      return preferencesFor(tx, customerId);
    });
    if (!result) return noCustomer(scope);
    return json(200, result, scope);
  };

  return { get, patch };
}
