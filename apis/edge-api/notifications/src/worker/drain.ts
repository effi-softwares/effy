// Pure drain orchestration — the worker's decision logic, dependency-injected so it is unit-testable
// with fakes (no DB, no FCM). 050-observability-push-foundation, contracts/notification-request.
import type { SendResult } from "../fcm/sender";
import type { NotificationType, RecipientToken } from "./copy";

export interface PendingRequest {
  id: string;
  recipientSub: string;
  audience: "customer" | "shop" | "driver";
  type: NotificationType;
  entityId: string;
  attempts: number;
}

export interface DrainDeps {
  senderConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  claimPending(limit: number): Promise<PendingRequest[]>;
  resolveTokens(sub: string, audience: PendingRequest["audience"]): Promise<RecipientToken[]>;
  send(fcmToken: string, type: NotificationType, entityId: string): Promise<SendResult>;
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
  disabled: boolean;
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
  };

  // FAIL-OPEN: not configured → leave everything pending, do nothing (FR-027).
  if (!deps.senderConfigured) {
    s.disabled = true;
    return s;
  }

  const batch = await deps.claimPending(deps.batchSize);
  s.claimed = batch.length;

  for (const req of batch) {
    const tokens = await deps.resolveTokens(req.recipientSub, req.audience);
    if (tokens.length === 0) {
      // No device / permission not granted — a valid outcome, NOT a failure (FR-019).
      await deps.markSkipped(req.id, "no_token");
      s.skipped += 1;
      continue;
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

  return s;
}
