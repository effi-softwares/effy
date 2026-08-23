import { describe, expect, it, vi } from "vitest";

import { drainOnce, type DrainDeps, type PendingRequest } from "./drain";
import type { SendResult } from "../fcm/sender";
import type { RecipientToken } from "./copy";

/** A deps builder with sensible fakes; each test overrides what it exercises. */
function deps(over: Partial<DrainDeps> & { pending?: PendingRequest[] }): DrainDeps {
  const pending = over.pending ?? [];
  return {
    senderConfigured: true,
    maxAttempts: 5,
    batchSize: 100,
    claimPending: vi.fn(async () => pending),
    resolveTokens: vi.fn(async (): Promise<RecipientToken[]> => []),
    send: vi.fn(async (): Promise<SendResult> => ({ ok: true, prune: false })),
    markSent: vi.fn(async () => {}),
    markSkipped: vi.fn(async () => {}),
    markRetry: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    pruneToken: vi.fn(async () => {}),
    ...over,
  };
}

const req = (over: Partial<PendingRequest> = {}): PendingRequest => ({
  id: "r1",
  recipientSub: "sub-1",
  audience: "customer",
  type: "order_paid",
  entityId: "order-1",
  attempts: 0,
  ...over,
});

describe("drainOnce", () => {
  it("no-ops (disabled) when the sender is not configured — rows stay pending (FR-027)", async () => {
    const d = deps({ senderConfigured: false, pending: [req()] });
    const s = await drainOnce(d);
    expect(s.disabled).toBe(true);
    expect(d.claimPending).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("marks skipped (not failed) when the recipient has no tokens (FR-019)", async () => {
    const d = deps({ pending: [req()], resolveTokens: vi.fn(async () => []) });
    const s = await drainOnce(d);
    expect(s.skipped).toBe(1);
    expect(s.failed).toBe(0);
    expect(d.markSkipped).toHaveBeenCalledWith("r1", "no_token");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("sends and marks sent when a token accepts", async () => {
    const d = deps({
      pending: [req()],
      resolveTokens: vi.fn(async () => [{ fcmToken: "tok-a", platform: "android" as const }]),
      send: vi.fn(async () => ({ ok: true, prune: false })),
    });
    const s = await drainOnce(d);
    expect(s.sent).toBe(1);
    expect(d.markSent).toHaveBeenCalledWith("r1");
  });

  it("prunes a dead token and retries when nothing was delivered (FR-018)", async () => {
    const d = deps({
      pending: [req({ attempts: 0 })],
      resolveTokens: vi.fn(async () => [{ fcmToken: "dead", platform: "ios" as const }]),
      send: vi.fn(async () => ({ ok: false, prune: true, errorClass: "messaging/registration-token-not-registered" })),
    });
    const s = await drainOnce(d);
    expect(s.pruned).toBe(1);
    expect(s.retried).toBe(1);
    expect(s.failed).toBe(0);
    expect(d.pruneToken).toHaveBeenCalledWith("dead");
    expect(d.markSent).not.toHaveBeenCalled();
  });

  it("still marks sent if one of several tokens accepts, pruning the dead one", async () => {
    const send = vi
      .fn<(t: string) => Promise<SendResult>>()
      .mockResolvedValueOnce({ ok: false, prune: true, errorClass: "messaging/invalid-argument" })
      .mockResolvedValueOnce({ ok: true, prune: false });
    const d = deps({
      pending: [req()],
      resolveTokens: vi.fn(async () => [
        { fcmToken: "dead", platform: "android" as const },
        { fcmToken: "live", platform: "ios" as const },
      ]),
      send: send as unknown as DrainDeps["send"],
    });
    const s = await drainOnce(d);
    expect(s.sent).toBe(1);
    expect(s.pruned).toBe(1);
    expect(d.markSent).toHaveBeenCalledWith("r1");
  });

  it("fails (not retries) once the attempt cap is reached", async () => {
    const d = deps({
      maxAttempts: 3,
      pending: [req({ attempts: 2 })], // this attempt makes 3 → cap
      resolveTokens: vi.fn(async () => [{ fcmToken: "x", platform: "android" as const }]),
      send: vi.fn(async () => ({ ok: false, prune: false, errorClass: "messaging/internal-error" })),
    });
    const s = await drainOnce(d);
    expect(s.failed).toBe(1);
    expect(s.retried).toBe(0);
    expect(d.markFailed).toHaveBeenCalledWith("r1", "messaging/internal-error");
  });
});
