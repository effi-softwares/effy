// 115: a back-office message by email - the ONE building of its email (research R1, R5), used by the notifications
// drain for every recipient and by the admin service's test send. The words are the inbox item's own; marketing kinds
// (offers, news) carry the unsubscribe link and the RFC 8058 one-click headers. Pure, so both callers and the tests share it.
import { customerWebUrlFor, fillFirstName, parseDestination, type CustomerDestination } from "@effy/shared-types";

import type { Queryable } from "../../lib/db";

export interface MessageEmail {
  to: string;
  recipientSub: string;
  /** The message id (the notification's entity id), for the unsubscribe count. Empty for a test. */
  messageId: string;
  category: string;
  title: string;
  body: string;
  destination: Record<string, unknown>;
  imageUrl: string | null;
}

/** The `message` template's variables (email-kit). */
export interface MessageEmailVars {
  title: string;
  preheader: string;
  paragraphs: { text: string }[];
  hasImage: boolean;
  imageUrl: string;
  buttonLabel: string;
  buttonUrl: string;
  marketing: boolean;
  reason: string;
  senderName: string;
  unsubscribeUrl: string;
}

const MARKETING_REASON: Record<string, string> = { offers: "offers", news: "news" };

export function isMarketingCategory(category: string): boolean {
  return category in MARKETING_REASON;
}

/** The email's parts. null for a marketing email with no unsubscribe token: never sent without a way out. */
export function messageEmailVars(
  m: MessageEmail,
  r: { givenName: string | null; token: string | null },
  urls: { site: string; edge: string },
): { vars: MessageEmailVars; headers: { name: string; value: string }[] } | null {
  const marketing = isMarketingCategory(m.category);
  if (marketing && !r.token) return null;
  const destination = parseDestination("customer", JSON.stringify(m.destination)) as CustomerDestination | null;
  const body = fillFirstName(m.body, r.givenName);
  const paragraphs = body.split(/\n{2,}|\r?\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text }));
  const query = marketing ? `t=${encodeURIComponent(r.token!)}${m.messageId ? `&m=${encodeURIComponent(m.messageId)}` : ""}` : "";
  return {
    vars: {
      title: m.title,
      // The preheader shows in a mail app's preview: the fallback, never the name.
      preheader: fillFirstName(m.body, null).split(/\r?\n/)[0]!.slice(0, 120),
      paragraphs,
      hasImage: m.imageUrl !== null,
      imageUrl: m.imageUrl ?? "",
      buttonLabel: "Open in Effy",
      buttonUrl: customerWebUrlFor(urls.site, destination),
      marketing,
      reason: MARKETING_REASON[m.category] ?? "",
      senderName: "Effy",
      unsubscribeUrl: marketing ? `${urls.site}/email/unsubscribe?${query}` : "",
    },
    headers: marketing
      ? [
          { name: "List-Unsubscribe", value: `<${urls.edge}/customer/v1/email-unsubscribe?${query}>` },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
        ]
      : [],
  };
}

/** The address bounces permanently or reported spam (038's record): no message email goes to it (115 FR-008). */
export async function isSuppressed(db: Queryable, address: string): Promise<boolean> {
  const row = (await db.query<{ state: string }>(`SELECT state FROM public.email_delivery_status WHERE address = $1`, [address])).rows[0];
  return row?.state === "undeliverable" || row?.state === "complained";
}

/** The customer's first name and unsubscribe token (null when none). */
export async function emailRecipientOf(db: Queryable, sub: string): Promise<{ givenName: string | null; token: string | null }> {
  const row = (await db.query<{ given_name: string | null; token: string | null }>(
    `SELECT given_name, email_unsubscribe_token AS token FROM public.customer WHERE cognito_sub = $1`,
    [sub],
  )).rows[0];
  return { givenName: row?.given_name?.trim() || null, token: row?.token ?? null };
}
