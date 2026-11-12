// 116 C6: badge corrections, a step of every drain run (contracts/push.md). The queue is filled by
// @effy/edge-shared/notifications badge.ts (inbox changes, notify(), the expiry sweep run here); each due person gets one
// silent push per app device carrying their unseen count (iOS: the icon number; Android: the ids still to keep shown).
import type { Queryable, Transactor } from "@effy/edge-shared";

import type { BadgeMessage, SendResult } from "../fcm/sender";
import { badgeTokens, claimDueBadges, pruneTokens, queuedBadges } from "./badge-repository";

export interface BadgeDeps {
  db: Queryable;
  transact: Transactor;
  now(): Date;
  senderConfigured: boolean;
  sendBadges(messages: readonly BadgeMessage[]): Promise<SendResult[]>;
  log?: { warn(obj: unknown, msg: string): void };
}

export interface BadgeOutcome {
  sent: number;
  noDevices: number;
  failed: number;
}

export interface BadgeSummary {
  swept: number;
  people: number;
  pruned: number;
  /** Per audience, for `BadgeCorrections{audience, outcome}`. */
  byAudience: Record<"customer" | "driver", BadgeOutcome>;
  queued: number;
}

const empty = (): BadgeOutcome => ({ sent: 0, noDevices: 0, failed: 0 });

export async function sendBadgeCorrections(deps: BadgeDeps): Promise<BadgeSummary> {
  const s: BadgeSummary = { swept: 0, people: 0, pruned: 0, byAudience: { customer: empty(), driver: empty() }, queued: 0 };
  // Without FCM nothing can be sent: leave the queue as it is (claiming would lose the corrections).
  if (!deps.senderConfigured) {
    s.queued = await queuedBadges(deps.db);
    return s;
  }
  const now = deps.now();
  const { swept, due } = await deps.transact((tx) => claimDueBadges(tx, now));
  s.swept = swept;
  s.people = due.length;
  if (due.length > 0) {
    const tokens = await badgeTokens(deps.db, due);
    const byPerson = new Map(due.map((d) => [`${d.audience}:${d.sub}`, d]));
    const messages: BadgeMessage[] = [];
    const owners: string[] = [];
    for (const t of tokens) {
      const d = byPerson.get(`${t.audience}:${t.sub}`);
      if (!d) continue;
      messages.push({ token: t.token, platform: t.platform, count: d.count, keep: d.keep });
      owners.push(`${t.audience}:${t.sub}`);
    }
    const withDevice = new Set(owners);
    for (const d of due) if (!withDevice.has(`${d.audience}:${d.sub}`)) s.byAudience[d.audience].noDevices += 1;

    const results = messages.length > 0 ? await deps.sendBadges(messages) : [];
    const sent = new Set<string>();
    const dead: string[] = [];
    results.forEach((r, i) => {
      if (r.ok) sent.add(owners[i]!);
      else {
        if (r.prune) dead.push(messages[i]!.token);
        deps.log?.warn({ platform: messages[i]!.platform, errorClass: r.errorClass ?? "unknown", pruning: r.prune }, "badge correction failed");
      }
    });
    for (const key of withDevice) {
      const audience = byPerson.get(key)!.audience;
      if (sent.has(key)) s.byAudience[audience].sent += 1;
      else s.byAudience[audience].failed += 1;
    }
    if (dead.length > 0) {
      await pruneTokens(deps.db, dead);
      s.pruned = dead.length;
    }
  }
  s.queued = await queuedBadges(deps.db);
  return s;
}
