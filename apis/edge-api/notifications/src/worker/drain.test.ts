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
    sendEmail: vi.fn(async (): Promise<SendResult> => ({ ok: true, prune: false })),
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
  channel: "push",
  recipientEmail: null,
  ...over,
});

describe("drainOnce", () => {
  /**
   * ⚠ 053 NARROWED THIS, and the previous version of this test asserted the wider behaviour
   * (`claimPending` was never called at all when FCM was unconfigured).
   *
   * That was correct while the outbox carried push only. Once the EMAIL channel shares it, skipping
   * the whole batch means a missing FCM service account silently suppresses the only message a
   * web-only shopper gets about their delivery — one channel's misconfiguration taking out an
   * unrelated one. Push still fails open per row; the batch is still claimed.
   */
  it("leaves PUSH rows pending when FCM is unconfigured, without blocking the batch (FR-027)", async () => {
    const d = deps({ senderConfigured: false, pending: [req()] });
    const s = await drainOnce(d);
    expect(s.disabled).toBe(true);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.markFailed, "an unconfigured sender is not a delivery failure").not.toHaveBeenCalled();
    expect(d.markRetry).toHaveBeenCalledWith("r1", "fcm_not_configured");
  });

  it("still delivers EMAIL rows when FCM is unconfigured", async () => {
    const d = deps({
      senderConfigured: false,
      pending: [req({ channel: "email", recipientEmail: "shopper@example.com", type: "order_delivered" })],
    });
    const s = await drainOnce(d);

    expect(d.sendEmail).toHaveBeenCalledWith("shopper@example.com", "order_delivered", "order-1");
    expect(s.emailSent).toBe(1);
    expect(d.markSent).toHaveBeenCalledWith("r1");
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

/**
 * The email channel (053 US3) — the only way a shopper who never installed the app hears that their
 * order arrived.
 */
describe("drainOnce — the email channel", () => {
  const emailReq = (over: Partial<PendingRequest> = {}) =>
    req({
      channel: "email",
      recipientEmail: "shopper@example.com",
      type: "order_delivered",
      ...over,
    });

  it("sends to the address SNAPSHOTTED on the row, never a looked-up one", async () => {
    // ⚠ 052's rule. A customer who later changes their account email must not retroactively
    // redirect a message about an order that has already arrived. The drain must pass through what
    // the producer captured.
    const d = deps({ pending: [emailReq({ recipientEmail: "at-the-time@example.com" })] });
    await drainOnce(d);
    expect(d.sendEmail).toHaveBeenCalledWith("at-the-time@example.com", "order_delivered", "order-1");
  });

  it("never resolves device tokens for an email row", async () => {
    const d = deps({ pending: [emailReq()] });
    await drainOnce(d);
    expect(d.resolveTokens).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("retries a send failure until the attempt budget, then fails", async () => {
    const failing = vi.fn(async (): Promise<SendResult> => ({ ok: false, prune: false, errorClass: "send_failed" }));

    const retrying = deps({ pending: [emailReq({ attempts: 0 })], sendEmail: failing });
    const a = await drainOnce(retrying);
    expect(a.retried).toBe(1);
    expect(retrying.markFailed).not.toHaveBeenCalled();

    const exhausted = deps({ pending: [emailReq({ attempts: 4 })], sendEmail: failing });
    const b = await drainOnce(exhausted);
    expect(b.emailFailed).toBe(1);
    expect(exhausted.markFailed).toHaveBeenCalledWith("r1", "send_failed");
  });

  it("skips (does not fail) a row with no address — there is nothing to retry toward", async () => {
    const d = deps({ pending: [emailReq({ recipientEmail: null })] });
    const s = await drainOnce(d);
    expect(s.skipped).toBe(1);
    expect(d.markSkipped).toHaveBeenCalledWith("r1", "no_email");
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it("fans one order out to both channels independently", async () => {
    // The shape the arrival produces: two rows, one intent. A push failure must not suppress the
    // email, and vice versa — which is the whole reason they are separate rows.
    const d = deps({
      pending: [
        req({ id: "push-row", type: "order_delivered" }),
        emailReq({ id: "email-row" }),
      ],
      resolveTokens: vi.fn(async () => []),
    });
    const s = await drainOnce(d);

    expect(d.markSkipped).toHaveBeenCalledWith("push-row", "no_token");
    expect(d.markSent).toHaveBeenCalledWith("email-row");
    expect(s.emailSent).toBe(1);
  });
});
