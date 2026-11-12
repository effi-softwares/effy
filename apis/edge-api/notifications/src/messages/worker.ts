// Sending back-office messages (112 R3; contracts/sending.md). Every minute:
//   0. automatic - 115: automatic messages due now create their run's message (automations.ts), sent below this minute;
//   1. due      - a scheduled message whose time has come starts sending, unless it now reaches more people than the
//                 largest message allows (then it is not sent, and says why);
//   2. pages    - each sending message is written 1,000 people at a time, ONE transaction per page: the message is
//                 re-locked (a stop or withdrawal ends it here), the next people after the cursor are worked out at
//                 this moment, notify() writes their notifications, and the cursor moves on in the same commit. A crash
//                 loses at most the page in flight and never repeats one; the dedupe key is the second guard;
//   3. withdrawn - recipients' open inboxes are told a withdrawn message has gone;
//   4. back-office's open screens are told once if anything moved.
import { publicImageUrl, type Queryable, type Transactor } from "@effy/edge-shared";
import {
  countAudience,
  ensureUnsubscribeTokens,
  messageTypeFor,
  notify as realNotify,
  recipientsSql,
  type NotificationCategory,
  type NotifyInput,
} from "@effy/edge-shared/notifications";
import { MESSAGE_LIMITS, messageFiling, messageKind, type NotificationAudience } from "@effy/shared-types";

import { runAutomations } from "./automations";
import * as repo from "./repository";
import type { SendingMessage } from "./repository";

export interface MessagesDeps {
  db: Queryable;
  transact: Transactor;
  now: () => Date;
  /** Epoch ms after which no new page starts. */
  deadline: number;
  pageSize?: number;
  /** Tell back-office's open screens (the ops kind `messages`). */
  announceOps: () => Promise<void>;
  /** Tell recipients' open inboxes. */
  announceInbox: (recipients: { audience: NotificationAudience; sub: string }[]) => Promise<void>;
  /** A seam for tests that crash part-way. */
  notify?: (tx: Queryable, input: NotifyInput) => Promise<number>;
}

export interface MessagesSummary {
  started: number;
  notSent: number;
  pages: number;
  written: number;
  sent: number;
  withdrawalsAnnounced: number;
  /** 115: automatic runs this pass, the messages they created and the trigger recipients they recorded. */
  automationRuns: number;
  automationMessages: number;
  automationRecipients: number;
}

function consentCategory(kind: SendingMessage["kind"]): "offers" | "news" | null {
  return kind === "offer" ? "offers" : kind === "news" ? "news" : null;
}

async function due(deps: MessagesDeps, s: MessagesSummary): Promise<void> {
  for (const id of await repo.dueIds(deps.db, deps.now())) {
    await deps.transact(async (tx) => {
      const m = await repo.lockIn(tx, id, "scheduled");
      if (!m) return;
      // The audience is worked out now, at the moment it is sent (FR-010); so is the limit.
      let count = 0;
      for (const a of m.audiences) {
        const c = await countAudience(tx, a.audience, a.filter, consentCategory(m.kind), deps.now());
        count += messageKind(m.kind)?.marketing ? (c.consented ?? 0) : c.matched;
      }
      const limit = await repo.maxRecipients(tx);
      if (count > limit) {
        await repo.markNotSent(tx, m.id, count, limit);
        s.notSent += 1;
      } else {
        await repo.startSending(tx, m.id);
        s.started += 1;
      }
    });
  }
}

/** One page of one message. `false` when the message is finished, stopped, withdrawn or held by another pass. */
async function page(deps: MessagesDeps, id: string, s: MessagesSummary): Promise<boolean> {
  const notify = deps.notify ?? realNotify;
  return deps.transact(async (tx) => {
    const m = await repo.lockIn(tx, id, "sending");
    if (!m) return false;
    const order = m.audiences.map((a) => a.audience);
    let at = m.cursorAudience ? order.indexOf(m.cursorAudience) : 0;
    let after = m.cursorAudience ? m.cursorSub : null;
    if (at < 0) at = 0;
    for (; at < m.audiences.length; at += 1, after = null) {
      const a = m.audiences[at]!;
      const q = recipientsSql(a.audience, a.filter, { afterSub: after, limit: deps.pageSize ?? 1000, now: deps.now() });
      const subs = (await tx.query<{ sub: string }>(q.text, q.values)).rows.map((r) => r.sub);
      if (subs.length === 0) continue;
      const filing = messageFiling(m.kind, a.audience)!;
      // 115: email for customers - their addresses, and for marketing kinds an unsubscribe token before the email exists.
      const byEmail = m.email && a.audience === "customer";
      const emails = byEmail ? await repo.customerEmails(tx, subs) : new Map<string, string>();
      if (byEmail && messageKind(m.kind)?.marketing) await ensureUnsubscribeTokens(tx, [...emails.keys()]);
      const channels: ("push" | "email")[] = [...(m.push ? (["push"] as const) : []), ...(byEmail ? (["email"] as const) : [])];
      const written = await notify(tx, {
        type: messageTypeFor(a.audience),
        recipients: subs.map((sub) => ({ sub, email: emails.get(sub) ?? null })),
        subject: { entityId: m.id },
        dedupeScope: m.id,
        channels,
        expiresAt: m.endsAt,
        pinnedUntil:
          filing.importance === "important"
            ? (m.endsAt ?? new Date((m.sendAt ?? deps.now()).getTime() + MESSAGE_LIMITS.importantPinDays * 86_400_000))
            : null,
        message: {
          messageId: m.id,
          source: m.kind === "direct" ? "direct" : "campaign",
          category: filing.category as NotificationCategory,
          importance: filing.importance,
          title: m.title,
          body: m.body,
          destination: a.destination,
          imageUrl: m.pictureKey ? publicImageUrl(m.pictureKey) : null,
          nameFallback: m.nameFallback,
        },
      });
      await repo.advance(tx, m.id, a.audience, subs.length, subs[subs.length - 1]!);
      s.pages += 1;
      s.written += written;
      return true;
    }
    // Every audience is written.
    await repo.markSent(tx, m.id);
    s.sent += 1;
    return false;
  });
}

async function announceWithdrawals(deps: MessagesDeps, s: MessagesSummary): Promise<void> {
  for (const id of await repo.withdrawnToAnnounce(deps.db)) {
    if (Date.now() > deps.deadline) return;
    const recipients = await repo.recipientsOf(deps.db, id);
    for (let i = 0; i < recipients.length; i += 1000) await deps.announceInbox(recipients.slice(i, i + 1000));
    await repo.markWithdrawAnnounced(deps.db, id);
    s.withdrawalsAnnounced += 1;
  }
}

export async function runMessagesPass(deps: MessagesDeps): Promise<MessagesSummary> {
  const s: MessagesSummary = {
    started: 0, notSent: 0, pages: 0, written: 0, sent: 0, withdrawalsAnnounced: 0, automationRuns: 0, automationMessages: 0,
    automationRecipients: 0,
  };
  const auto = await runAutomations({ db: deps.db, transact: deps.transact, now: deps.now });
  s.automationRuns = auto.runs + auto.waited;
  s.automationMessages = auto.messages;
  s.automationRecipients = auto.recipients;
  await due(deps, s);
  for (const id of await repo.sendingIds(deps.db)) {
    while (Date.now() < deps.deadline && (await page(deps, id, s))) {
      // next page of the same message
    }
    if (Date.now() >= deps.deadline) break;
  }
  await announceWithdrawals(deps, s);
  if (s.started + s.notSent + s.pages + s.sent + s.withdrawalsAnnounced + s.automationRuns > 0) await deps.announceOps();
  return s;
}
