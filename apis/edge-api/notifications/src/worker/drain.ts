// The drain's decision logic, injected for unit tests. One intent produces one row per channel, so
// "does this person have the app?" is answered at delivery.
import type { SendResult } from "../fcm/sender";
import type { NotificationType, RecipientToken } from "./copy";

export type NotificationChannel = "push" | "email";

export interface PendingRequest {
  id: string;
  recipientSub: string;
  audience: "customer" | "shop" | "driver";
  type: NotificationType;
  entityId: string;
  attempts: number;
  channel: NotificationChannel;
  /** Snapshotted at enqueue for `email`; null for `push`. */
  recipientEmail: string | null;
}

export interface DrainDeps {
  senderConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  claimPending(limit: number): Promise<PendingRequest[]>;
  resolveTokens(sub: string, audience: PendingRequest["audience"]): Promise<RecipientToken[]>;
  send(
    fcmToken: string,
    type: NotificationType,
    entityId: string,
    platform: RecipientToken["platform"],
  ): Promise<SendResult>;
  /** Resolves what it renders from `entityId` at send time. */
  sendEmail(to: string, type: NotificationType, entityId: string): Promise<SendResult>;
  markSent(id: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markRetry(id: string, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  pruneToken(fcmToken: string): Promise<void>;
  /** Absent in unit tests. */
  log?: { warn(obj: unknown, msg: string): void };
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  pruned: number;
  /** Email still drains. */
  disabled: boolean;
  /** Split so the alarm says which channel broke. */
  emailSent: number;
  emailFailed: number;
  /** Push outcomes by platform, as a separate metric: a dimension would blind the undimensioned alarm. */
  byPlatform: Record<string, { sent: number; failed: number }>;
}

/** Rows are claimed for UPDATE skip locked and only when pending, so a re-run never re-sends. */
export async function drainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const s: DrainSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    byPlatform: {},
    retried: 0,
    failed: 0,
    pruned: 0,
    disabled: false,
    emailSent: 0,
    emailFailed: 0,
  };

  // Without FCM, push rows fail open but email rows still drain.
  if (!deps.senderConfigured) s.disabled = true;

  const batch = await deps.claimPending(deps.batchSize);
  s.claimed = batch.length;

  for (const req of batch) {
    if (req.channel === "email") {
      await drainEmail(deps, req, s);
    } else {
      await drainPush(deps, req, s);
    }
  }

  return s;
}

async function drainPush(deps: DrainDeps, req: PendingRequest, s: DrainSummary): Promise<void> {
  if (!deps.senderConfigured) {
    // Fail open: leave it pending until FCM is configured. Not an attempt.
    await deps.markRetry(req.id, "fcm_not_configured");
    s.retried += 1;
    return;
  }

  const allTokens = await deps.resolveTokens(req.recipientSub, req.audience);
  if (allTokens.length === 0) {
    // No device or no permission: a valid outcome.
    await deps.markSkipped(req.id, "no_token");
    s.skipped += 1;
    return;
  }

  // This registration's preferences, not the person's. A mobile row has no `mutedTypes`.
  const tokens = allTokens.filter((t) => !(t.mutedTypes ?? []).includes(req.type));
  if (tokens.length === 0) {
    // Distinct from "no_token": nobody reachable versus everybody chose not to be.
    await deps.markSkipped(req.id, "muted");
    s.skipped += 1;
    return;
  }

  let delivered = false;
  let lastError = "unknown";
  for (const t of tokens) {
    const r = await deps.send(t.fcmToken, req.type, req.entityId, t.platform);
    const p = (s.byPlatform[t.platform] ??= { sent: 0, failed: 0 });
    if (r.ok) {
      delivered = true;
      p.sent += 1;
    } else {
      p.failed += 1;
      lastError = r.errorClass ?? "unknown";
      // Logged per token, because `last_error` is overwritten once the token is pruned. Never the token
      // itself: the platform is enough.
      deps.log?.warn(
        {
          notificationId: req.id,
          type: req.type,
          platform: t.platform,
          errorClass: r.errorClass ?? "unknown",
          pruning: r.prune,
        },
        "notification send failed",
      );
      if (r.prune) {
        await deps.pruneToken(t.fcmToken);
        s.pruned += 1;
      }
    }
  }

  if (delivered) {
    await deps.markSent(req.id);
    s.sent += 1;
  } else if (req.attempts + 1 >= deps.maxAttempts) {
    await deps.markFailed(req.id, lastError);
    s.failed += 1;
  } else {
    await deps.markRetry(req.id, lastError);
    s.retried += 1;
  }
}

async function drainEmail(deps: DrainDeps, req: PendingRequest, s: DrainSummary): Promise<void> {
  if (!req.recipientEmail) {
    // A check forbids this; skipped, not failed.
    await deps.markSkipped(req.id, "no_email");
    s.skipped += 1;
    return;
  }

  const r = await deps.sendEmail(req.recipientEmail, req.type, req.entityId);
  if (r.ok) {
    await deps.markSent(req.id);
    s.sent += 1;
    s.emailSent += 1;
    return;
  }

  const err = r.errorClass ?? "unknown";
  if (req.attempts + 1 >= deps.maxAttempts) {
    await deps.markFailed(req.id, err);
    s.failed += 1;
    s.emailFailed += 1;
  } else {
    await deps.markRetry(req.id, err);
    s.retried += 1;
  }
}
