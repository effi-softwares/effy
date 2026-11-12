// The delivery drain's decisions (109), with the database and FCM injected for tests.
//
// Each batch is claimed, sent and recorded inside one transaction, so its rows stay locked until their outcomes are
// written and an overlapping invocation can never send them twice. Batches repeat until the queue is empty or the time
// budget is spent, which is what lets 20,000 deliveries clear in minutes. Immediate deliveries are claimed before
// bulk ones (priority, then age), so one notification never waits behind a large send.
import type { DevicePlatform, Queryable, RecipientToken } from "@effy/edge-shared";

import type { PushMessage, SendResult } from "../fcm/sender";
import { fillFirstName, interruptionLevelFor } from "@effy/shared-types";

export type DeliveryChannel = "push" | "email";
export type Audience = "customer" | "shop" | "driver";

export interface ClaimedDelivery {
  id: string;
  notificationId: string;
  channel: DeliveryChannel;
  recipientEmail: string | null;
  attempts: number;
  recipientSub: string;
  audience: Audience;
  type: string;
  title: string;
  body: string;
  entityId: string;
  /** As stored (an object). */
  destination: Record<string, unknown>;
  expiresAt: Date | null;
  tag: string;
  group: string;
  /** The recipient's unseen count when claimed (110 R8) - the number on the app icon. */
  badge?: number;
  /** The Android notification channel of its category (111 R12); null for the shop console. */
  androidChannel?: string | null;
  /** A back-office message's picture (112). */
  imageUrl?: string | null;
  /** 115: the notification's category (a message email is marketing when it is offers or news). */
  category?: string;
  /** 116 D7: `important` breaks through Focus on iPhones (when switched on). */
  importance?: string;
  /**
   * False when a held promotional push may no longer go: consent withdrawn or push turned off since it was written
   * (111 FR-011). Absent or true otherwise.
   */
  allowed?: boolean;
}

export type OutcomeStatus = "sent" | "no_device" | "muted" | "expired" | "failed" | "retry" | "skipped";

export interface Outcome {
  id: string;
  status: OutcomeStatus;
  error: string | null;
  /** 1 when a send was attempted. */
  attempted: boolean;
}

/** One batch's database work, inside its transaction. */
export interface BatchStore {
  claim(limit: number, channels: readonly DeliveryChannel[]): Promise<ClaimedDelivery[]>;
  /** Keyed `${audience}:${sub}`. */
  tokensFor(recipients: ReadonlyArray<{ sub: string; audience: Audience }>): Promise<Map<string, RecipientToken[]>>;
  record(outcomes: readonly Outcome[]): Promise<void>;
  prune(tokens: readonly string[]): Promise<void>;
  /** The batch's own transaction, for an email that must read the database (the pool's one connection is this). */
  db: Queryable;
}

export interface DrainDeps {
  senderConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  /** Epoch ms; no new batch is claimed at or after it. */
  deadline: number;
  now(): number;
  inBatch<T>(fn: (store: BatchStore) => Promise<T>): Promise<T>;
  sendEach(messages: readonly PushMessage[]): Promise<SendResult[]>;
  /** Resolves what it renders from `entityId` at send time. */
  sendEmail(to: string, type: string, entityId: string, db: Queryable): Promise<SendResult>;
  /** 116 D7: the environment's Apple team id is real - important iPhone pushes may be time-sensitive. */
  timeSensitiveOn?: boolean;
  /** 115: a back-office message by email; "suppressed" = not sent to a bouncing or complaining address. */
  sendMessageEmail?(d: ClaimedDelivery, db: Queryable): Promise<SendResult | "suppressed">;
  log?: { warn(obj: unknown, msg: string): void };
}

export interface DrainSummary {
  batches: number;
  claimed: number;
  sent: number;
  noDevice: number;
  muted: number;
  expired: number;
  /** Promotional pushes no longer allowed when released (111). */
  skipped: number;
  retried: number;
  failed: number;
  pruned: number;
  /** Push not configured: only email was claimed. */
  disabled: boolean;
  emailSent: number;
  emailFailed: number;
  /** Push outcomes by platform, as a separate metric: a dimension would blind the undimensioned alarm. */
  byPlatform: Record<string, { sent: number; failed: number }>;
}

export function emptySummary(): DrainSummary {
  return {
    batches: 0, claimed: 0, sent: 0, noDevice: 0, muted: 0, expired: 0, skipped: 0, retried: 0, failed: 0, pruned: 0,
    disabled: false, emailSent: 0, emailFailed: 0, byPlatform: {},
  };
}

export async function drainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const s = emptySummary();
  // Without FCM, push deliveries stay pending untouched (not an attempt); email still drains.
  const channels: DeliveryChannel[] = deps.senderConfigured ? ["push", "email"] : ["email"];
  if (!deps.senderConfigured) s.disabled = true;

  while (deps.now() < deps.deadline) {
    const claimed = await deps.inBatch((store) => runBatch(deps, store, channels, s));
    if (claimed < deps.batchSize) break;
  }
  return s;
}

async function runBatch(deps: DrainDeps, store: BatchStore, channels: DeliveryChannel[], s: DrainSummary): Promise<number> {
  const batch = await store.claim(deps.batchSize, channels);
  if (batch.length === 0) return 0;
  s.batches += 1;
  s.claimed += batch.length;

  const outcomes: Outcome[] = [];
  const now = deps.now();
  const live: ClaimedDelivery[] = [];
  for (const d of batch) {
    if (d.expiresAt && d.expiresAt.getTime() <= now) {
      outcomes.push({ id: d.id, status: "expired", error: null, attempted: false });
      s.expired += 1;
    } else if (d.allowed === false) {
      outcomes.push({ id: d.id, status: "skipped", error: null, attempted: false });
      s.skipped += 1;
    } else {
      live.push(d);
    }
  }

  await pushes(deps, store, live.filter((d) => d.channel === "push"), outcomes, s);
  for (const d of live.filter((x) => x.channel === "email")) outcomes.push(await emailSafely(deps, store.db, d, s));

  await store.record(outcomes);
  return batch.length;
}

async function pushes(deps: DrainDeps, store: BatchStore, rows: ClaimedDelivery[], outcomes: Outcome[], s: DrainSummary): Promise<void> {
  if (rows.length === 0) return;
  const tokens = await store.tokensFor(rows.map((d) => ({ sub: d.recipientSub, audience: d.audience })));

  const messages: PushMessage[] = [];
  /** messages[i] belongs to rows[owner[i]]. */
  const owner: number[] = [];
  rows.forEach((d, index) => {
    const all = tokens.get(`${d.audience}:${d.recipientSub}`) ?? [];
    if (all.length === 0) {
      // No device or no permission: a valid outcome.
      outcomes.push({ id: d.id, status: "no_device", error: null, attempted: false });
      s.noDevice += 1;
      return;
    }
    // This registration's preferences, not the person's (the shop console's per-device choices).
    const reachable = all.filter((t) => !(t.mutedTypes ?? []).includes(d.type));
    if (reachable.length === 0) {
      outcomes.push({ id: d.id, status: "muted", error: null, attempted: false });
      s.muted += 1;
      return;
    }
    for (const t of reachable) {
      messages.push(messageFor(d, t.fcmToken, t.platform, deps.timeSensitiveOn ?? false));
      owner.push(index);
    }
  });
  if (messages.length === 0) return;

  const results = await deps.sendEach(messages);
  const delivered = new Set<number>();
  const lastError = new Map<number, string>();
  const dead: string[] = [];
  results.forEach((r, i) => {
    const row = owner[i]!;
    const platform = messages[i]!.platform;
    const p = (s.byPlatform[platform] ??= { sent: 0, failed: 0 });
    if (r.ok) {
      delivered.add(row);
      p.sent += 1;
      return;
    }
    p.failed += 1;
    lastError.set(row, r.errorClass ?? "unknown");
    // Per token, because the error is overwritten once the token is pruned. Never the token itself.
    deps.log?.warn(
      { notificationId: rows[row]!.notificationId, type: rows[row]!.type, platform, errorClass: r.errorClass ?? "unknown", pruning: r.prune },
      "notification send failed",
    );
    if (r.prune) dead.push(messages[i]!.token);
  });
  if (dead.length > 0) {
    await store.prune(dead);
    s.pruned += dead.length;
  }

  const sentTo = new Set(owner);
  for (const index of sentTo) {
    const d = rows[index]!;
    if (delivered.has(index)) {
      outcomes.push({ id: d.id, status: "sent", error: null, attempted: true });
      s.sent += 1;
    } else if (d.attempts + 1 >= deps.maxAttempts) {
      outcomes.push({ id: d.id, status: "failed", error: lastError.get(index) ?? "unknown", attempted: true });
      s.failed += 1;
    } else {
      outcomes.push({ id: d.id, status: "retry", error: lastError.get(index) ?? "unknown", attempted: true });
      s.retried += 1;
    }
  }
}

/**
 * One push for one device. 115 FR-023: the lock screen NEVER shows a name - a stored first-name placeholder is filled
 * with the message's fallback ("Hi there"), whoever the recipient is.
 */
export function messageFor(d: ClaimedDelivery, token: string, platform: DevicePlatform, timeSensitiveOn = false): PushMessage {
  return {
    token,
    platform,
    type: d.type,
    notificationId: d.notificationId,
    title: fillFirstName(d.title, null),
    body: fillFirstName(d.body, null),
    destination: JSON.stringify(d.destination),
    tag: d.tag,
    group: d.group,
    badge: d.badge,
    androidChannel: d.androidChannel ?? null,
    imageUrl: d.imageUrl ?? null,
    // 116 D7: how urgently an iPhone shows it - important breaks through Focus (once switched on), offers and news quietly.
    interruptionLevel: interruptionLevelFor(d.importance ?? "normal", d.category ?? "", timeSensitiveOn),
  };
}

/**
 * One email, never throwing. The pushes of this batch have already gone out when emails are sent: a throw here would
 * roll the whole batch back - those pushes recorded as never sent, and sent again every minute, without end (seen on dev
 * 2026-11-13: one important message arrived on a phone again and again). An unexpected error is this email's own
 * retry, then its failure, like any other.
 */
async function emailSafely(deps: DrainDeps, db: Queryable, d: ClaimedDelivery, s: DrainSummary): Promise<Outcome> {
  try {
    return await email(deps, db, d, s);
  } catch (err) {
    const error = `threw:${err instanceof Error ? err.name : "unknown"}`.slice(0, 60);
    deps.log?.warn({ notificationId: d.notificationId, type: d.type, channel: "email", err: err instanceof Error ? err.message : String(err) }, "email send threw");
    if (d.attempts + 1 >= deps.maxAttempts) {
      s.failed += 1;
      s.emailFailed += 1;
      return { id: d.id, status: "failed", error, attempted: true };
    }
    s.retried += 1;
    return { id: d.id, status: "retry", error, attempted: true };
  }
}

async function email(deps: DrainDeps, db: Queryable, d: ClaimedDelivery, s: DrainSummary): Promise<Outcome> {
  if (!d.recipientEmail) {
    // A check forbids this.
    return { id: d.id, status: "failed", error: "no_email", attempted: false };
  }
  // A held promotional email released at 08:00 is judged again (consent or the switch withdrawn overnight → skipped).
  if (d.allowed === false) return { id: d.id, status: "skipped", error: null, attempted: false };
  const sent = d.type === "customer_message" && deps.sendMessageEmail ? await deps.sendMessageEmail(d, db) : null;
  if (sent === "suppressed") return { id: d.id, status: "skipped", error: "suppressed", attempted: false };
  const r = sent ?? (await deps.sendEmail(d.recipientEmail, d.type, d.entityId, db));
  if (r.ok) {
    s.sent += 1;
    s.emailSent += 1;
    return { id: d.id, status: "sent", error: null, attempted: true };
  }
  const err = r.errorClass ?? "unknown";
  if (d.attempts + 1 >= deps.maxAttempts) {
    s.failed += 1;
    s.emailFailed += 1;
    return { id: d.id, status: "failed", error: err, attempted: true };
  }
  s.retried += 1;
  return { id: d.id, status: "retry", error: err, attempted: true };
}
