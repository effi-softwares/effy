// 115: the credential behind the unsubscribe link in a marketing email - issued and resolved here, nothing else. A
// random 32-byte token per customer (base64url, 43 characters), stored so it can be replaced; not derived from a secret,
// so nothing has to be seeded. The switches and the consent record it changes are written by preferences.ts only
// (`unsubscribeFromEmail`, `undoEmailUnsubscribe`; 111's preferences.guard).
import { randomBytes } from "node:crypto";

import type { Queryable } from "../../lib/db";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newUnsubscribeToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Gives every customer in `subs` a token if they have none, in the caller's transaction. Returns sub → token. */
export async function ensureUnsubscribeTokens(tx: Queryable, subs: readonly string[]): Promise<Map<string, string>> {
  if (subs.length === 0) return new Map();
  const missing = (
    await tx.query<{ id: string }>(
      `SELECT id::text AS id FROM public.customer WHERE cognito_sub = ANY ($1::text[]) AND email_unsubscribe_token IS NULL`,
      [subs],
    )
  ).rows.map((r) => r.id);
  if (missing.length > 0) {
    await tx.query(
      `UPDATE public.customer c SET email_unsubscribe_token = t.token
         FROM unnest($1::uuid[], $2::text[]) AS t(id, token)
        WHERE c.id = t.id AND c.email_unsubscribe_token IS NULL`,
      [missing, missing.map(() => newUnsubscribeToken())],
    );
  }
  const rows = (
    await tx.query<{ sub: string; token: string }>(
      `SELECT cognito_sub AS sub, email_unsubscribe_token AS token FROM public.customer
        WHERE cognito_sub = ANY ($1::text[]) AND email_unsubscribe_token IS NOT NULL`,
      [subs],
    )
  ).rows;
  return new Map(rows.map((r) => [r.sub, r.token]));
}

/** The customer a token belongs to, or null - one indexed lookup, the same work for a wrong token as a right one. */
export async function customerForToken(db: Queryable, token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const row = (
    await db.query<{ id: string }>(`SELECT id::text AS id FROM public.customer WHERE email_unsubscribe_token = $1`, [token])
  ).rows[0];
  return row?.id ?? null;
}

/** The token of one customer by sub, for the email being sent (null when they have none - the worker issues it first). */
export async function unsubscribeTokenFor(db: Queryable, sub: string): Promise<string | null> {
  const row = (
    await db.query<{ token: string | null }>(`SELECT email_unsubscribe_token AS token FROM public.customer WHERE cognito_sub = $1`, [sub])
  ).rows[0];
  return row?.token ?? null;
}
