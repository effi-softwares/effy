import { describe, expect, it, vi } from "vitest";

import { drainReceiptsOnce, type PendingReceipt, type ReceiptDrainDeps } from "./drain";

/** The drain's decisions on a claimed row. Exactly-once is a unique index, proven in the container tests. */

const row = (over: Partial<PendingReceipt> = {}): PendingReceipt => ({
  id: "d1",
  orderId: "o1",
  recipient: "shopper@example.com",
  reason: "order_paid",
  attempts: 0,
  ...over,
});

function deps(over: Partial<ReceiptDrainDeps> = {}): ReceiptDrainDeps {
  return {
    mailerConfigured: true,
    maxAttempts: 3,
    batchSize: 10,
    claimPending: vi.fn(async () => [row()]),
    send: vi.fn(async () => ({ ok: true, messageId: "msg-1" })),
    markSent: vi.fn(async () => {}),
    markSkipped: vi.fn(async () => {}),
    markRetry: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...over,
  };
}

describe("drainReceiptsOnce", () => {
  it("sends a claimed receipt and records the provider message id", async () => {
    const d = deps();
    const s = await drainReceiptsOnce(d);

    expect(s).toMatchObject({ claimed: 1, sent: 1, failed: 0, skipped: 0, retried: 0 });
    // The message id joins a dispatch to `email_delivery_event`, so bounces trace to the order.
    expect(d.markSent).toHaveBeenCalledWith("d1", "msg-1");
  });

  /** Fail open: with no mail identity every row stays pending, not failed. */
  it("⚠ does nothing at all when the mailer is not configured", async () => {
    const d = deps({ mailerConfigured: false });
    const s = await drainReceiptsOnce(d);

    expect(s.disabled).toBe(true);
    expect(s.claimed).toBe(0);
    expect(d.claimPending).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  /** No address is a valid outcome, not a failure. */
  it("skips a dispatch with no recipient rather than failing it", async () => {
    const d = deps({ claimPending: vi.fn(async () => [row({ recipient: "" })]) });
    const s = await drainReceiptsOnce(d);

    expect(s).toMatchObject({ skipped: 1, failed: 0, sent: 0 });
    expect(d.markSkipped).toHaveBeenCalledWith("d1", "no_recipient");
    expect(d.send).not.toHaveBeenCalled();
  });

  /** An unreadable order will not reappear; retrying forever would only look like a backlog. */
  it("skips when the order can no longer be read", async () => {
    const d = deps({ send: vi.fn(async () => null) });
    const s = await drainReceiptsOnce(d);

    expect(s).toMatchObject({ skipped: 1, failed: 0 });
    expect(d.markSkipped).toHaveBeenCalledWith("d1", "order_unavailable");
  });

  it("retries below the attempt cap and fails at it", async () => {
    const failing = { ok: false as const, error: "ses_throttled" };

    const early = deps({ send: vi.fn(async () => failing), claimPending: vi.fn(async () => [row({ attempts: 0 })]) });
    expect(await drainReceiptsOnce(early)).toMatchObject({ retried: 1, failed: 0 });
    expect(early.markRetry).toHaveBeenCalledWith("d1", "ses_throttled");

    const last = deps({ send: vi.fn(async () => failing), claimPending: vi.fn(async () => [row({ attempts: 2 })]) });
    expect(await drainReceiptsOnce(last)).toMatchObject({ retried: 0, failed: 1 });
    expect(last.markFailed).toHaveBeenCalledWith("d1", "ses_throttled");
  });

  /** One order's thrown send must not strand the rest of the batch. */
  it("treats a thrown send as a failure and keeps draining the batch", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ ok: true, messageId: "msg-2" });

    const d = deps({
      send,
      claimPending: vi.fn(async () => [row({ id: "d1" }), row({ id: "d2" })]),
    });
    const s = await drainReceiptsOnce(d);

    expect(s).toMatchObject({ claimed: 2, sent: 1, retried: 1 });
    expect(d.markRetry).toHaveBeenCalledWith("d1", "socket hang up");
    expect(d.markSent).toHaveBeenCalledWith("d2", "msg-2");
  });

  /** A failed send touches only the dispatch row: the drain is given no way to mutate an order. */
  it("⚠ has no capability to touch the order, so a failed send cannot unmake a payment", async () => {
    const d = deps({ send: vi.fn(async () => ({ ok: false, error: "ses_denied" })) });
    const s = await drainReceiptsOnce(d);

    expect(s.retried + s.failed).toBe(1);
    expect(Object.keys(d).sort()).toEqual(
      [
        "batchSize",
        "claimPending",
        "mailerConfigured",
        "markFailed",
        "markRetry",
        "markSent",
        "markSkipped",
        "maxAttempts",
        "send",
      ].sort(),
    );
  });

  it("claims nothing beyond the batch size and reports an empty run cleanly", async () => {
    const d = deps({ claimPending: vi.fn(async () => []) });
    const s = await drainReceiptsOnce(d);

    expect(s).toMatchObject({ claimed: 0, sent: 0, failed: 0, disabled: false });
    expect(d.claimPending).toHaveBeenCalledWith(10);
  });
});
