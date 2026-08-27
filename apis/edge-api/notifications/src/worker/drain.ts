// Pure drain orchestration — the worker's decision logic, dependency-injected so it is unit-testable
// with fakes (no DB, no FCM, no SES). 050-observability-push-foundation, contracts/notification-request.
//
// ⚠ 053 ADDED A CHANNEL DIMENSION. One intent now produces one row per channel it should reach, and
// this loop fans out on `req.channel`. Telling a customer their order arrived is ONE INTENT delivered
// on TWO CHANNELS, not two messages — so "does this person have the app?" is answered HERE, at
// delivery time, rather than by the producer, which has no business knowing.
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
  /** 053. Rows written before the channel column default to `push`, which is what they were. */
  channel: NotificationChannel;
  /** 053. Snapshotted at enqueue for `email`; null for `push`. */
  recipientEmail: string | null;
}

export interface DrainDeps {
  senderConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  claimPending(limit: number): Promise<PendingRequest[]>;
  resolveTokens(sub: string, audience: PendingRequest["audience"]): Promise<RecipientToken[]>;
  send(fcmToken: string, type: NotificationType, entityId: string): Promise<SendResult>;
  /** 053 — the email channel. Resolves what it renders from `entityId` at send time. */
  sendEmail(to: string, type: NotificationType, entityId: string): Promise<SendResult>;
  markSent(id: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markRetry(id: string, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  pruneToken(fcmToken: string): Promise<void>;
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  pruned: number;
  /** True when the PUSH channel is unavailable. ⚠ Email still drains — see below. */
  disabled: boolean;
  /** 053 — split so the failure alarm can say which channel is broken. */
  emailSent: number;
  emailFailed: number;
}

/**
 * Drain one batch. Idempotent by construction: rows are claimed FOR UPDATE SKIP LOCKED (the repo), and
 * only pending rows are claimed, so a re-run never re-sends a `sent`/`skipped`/`failed` row (FR-016).
 */
export async function drainOnce(deps: DrainDeps): Promise<DrainSummary> {
  const s: DrainSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    pruned: 0,
    disabled: false,
    emailSent: 0,
    emailFailed: 0,
  };

  // ⚠ 053 NARROWED THIS GATE, AND THE NARROWING IS THE POINT. It used to return early for the whole
  // batch when FCM was unconfigured. With email on the same outbox that would mean a missing FCM
  // service account silently suppresses the ONLY message a web-only shopper gets about their
  // delivery — a push misconfiguration taking out an unrelated channel. Push rows still fail open;
  // email rows drain regardless.
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
    // FAIL-OPEN: leave it pending for a later tick, once FCM is configured (FR-027). Not claimed as
    // an attempt, not a failure.
    await deps.markRetry(req.id, "fcm_not_configured");
    s.retried += 1;
    return;
  }

  const tokens = await deps.resolveTokens(req.recipientSub, req.audience);
  if (tokens.length === 0) {
    // No device / permission not granted — a valid outcome, NOT a failure (FR-019).
    await deps.markSkipped(req.id, "no_token");
    s.skipped += 1;
    return;
  }

  let delivered = false;
  let lastError = "unknown";
  for (const t of tokens) {
    const r = await deps.send(t.fcmToken, req.type, req.entityId);
    if (r.ok) {
      delivered = true;
    } else {
      lastError = r.errorClass ?? "unknown";
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
    // ⚠ Unrepresentable in the database (a CHECK forbids channel='email' with a null address), so
    // this is defence in depth rather than an expected path. Skipped, not failed: there is nothing
    // to retry toward.
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
