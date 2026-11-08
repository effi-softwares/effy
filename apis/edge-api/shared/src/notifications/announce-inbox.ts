// Tells a person's open screens that their inbox changed (110 R6). The update is the single word "inbox".
//
// Whose channel:
// - customer: their own (the subject);
// - driver: their own (their driver id);
// - shop: their shop's - every operator there re-reads their OWN inbox, so the word says only "someone at your shop
//   has a change", never what or for whom.
// Active people only, by the same rules the live authorizer uses (live/scope.ts). Never throws: the change has
// already happened, and a lost update only leaves a screen to re-read when it next comes to the front.
import type { NotificationAudience } from "@effy/shared-types";

import { pooled, type Queryable } from "../lib/db";
import { logger } from "../lib/logger";
import { announce, type AnnounceDeps, type LiveChange } from "../live/announce";

export interface InboxRecipient {
  audience: NotificationAudience;
  sub: string;
}

export async function announceInbox(
  recipients: readonly InboxRecipient[],
  db: Queryable = pooled,
  deps: AnnounceDeps = {},
): Promise<void> {
  try {
    // No channel configured (local, tests): nothing to look up, nothing to send.
    if (!(deps.env ?? process.env).LIVE_HTTP_HOST) return;
    const subs = (audience: NotificationAudience) => [
      ...new Set(recipients.filter((r) => r.audience === audience && r.sub).map((r) => r.sub)),
    ];
    const changes: LiveChange[] = subs("customer").map((sub) => ({ scope: "customer", sub, kind: "inbox" }));

    const drivers = subs("driver");
    if (drivers.length > 0) {
      const { rows } = await db.query<{ id: string }>(
        `SELECT d.id::text AS id FROM public.driver d WHERE d.cognito_sub = ANY($1::text[]) AND d.status = 'active'`,
        [drivers],
      );
      for (const r of rows) changes.push({ scope: "driver", driverId: r.id, kind: "inbox" });
    }

    const operators = subs("shop");
    if (operators.length > 0) {
      const { rows } = await db.query<{ id: string }>(
        `SELECT DISTINCT st.id::text AS id
           FROM public.shop_staff ss
           JOIN public.shop st ON st.id = ss.shop_id
          WHERE ss.cognito_sub = ANY($1::text[]) AND ss.status = 'active' AND st.status = 'active'`,
        [operators],
      );
      for (const r of rows) changes.push({ scope: "shop", shopId: r.id, kind: "inbox" });
    }

    await announce(changes, deps);
  } catch (err) {
    logger.warn({ err }, "live: inbox update not sent");
  }
}
