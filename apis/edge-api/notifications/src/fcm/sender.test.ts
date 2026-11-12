import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FcmMessage = Record<string, unknown> & { token: string };
type BatchResponse = { responses: Array<{ success: boolean; error?: { code: string } }> };

// Typed mock parameters: an untyped `vi.fn` makes `mock.calls` `[][]`, which only tsc catches.
const sendEach = vi.fn(async (messages: FcmMessage[]): Promise<BatchResponse> => ({
  responses: messages.map(() => ({ success: true })),
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "test" })),
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({ sendEach: (m: FcmMessage[]) => sendEach(m) })),
}));
vi.mock("@effy/edge-shared", () => ({
  getSecretString: vi.fn(async () =>
    JSON.stringify({
      project_id: "p",
      client_email: "svc@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n",
    }),
  ),
}));

import { BADGE_KEEP_LIMIT, createSender, FCM_BATCH_LIMIT, toBadgeMessage, toFcmMessage, type PushMessage } from "./sender";

const message = (over: Partial<PushMessage> = {}): PushMessage => ({
  token: "tok",
  platform: "android",
  type: "shop_new_order",
  notificationId: "5b0c0000-0000-4000-8000-000000000001",
  title: "New order to pick",
  body: "A new order needs picking.",
  destination: '{"kind":"queue","fulfillmentId":"f-1"}',
  tag: "shop-new-order",
  group: "orders",
  ...over,
});

beforeEach(() => {
  process.env.FCM_SERVICE_ACCOUNT_ARN = "arn:aws:secretsmanager:ap-southeast-2:1:secret:fcm";
  process.env.FCM_PROJECT_ID = "effy-dev";
  sendEach.mockClear();
});
afterEach(() => vi.clearAllMocks());

async function sentFor(platform: PushMessage["platform"]): Promise<FcmMessage> {
  const sender = await createSender();
  await sender.sendEach([message({ platform })]);
  return sendEach.mock.calls.at(-1)![0][0]!;
}

describe("109 - the payload is the notification row's", () => {
  it("carries type, notificationId, destination and the words; no derived links", async () => {
    const msg = (await sentFor("android")) as unknown as { data: Record<string, string> };
    expect(Object.keys(msg.data).sort()).toEqual(["body", "destination", "group", "notificationId", "tag", "title", "type"]);
    expect(msg.data.notificationId).toBe("5b0c0000-0000-4000-8000-000000000001");
    expect(JSON.parse(msg.data.destination!)).toEqual({ kind: "queue", fulfillmentId: "f-1" });
  });

  it("uses the words it is given, not a catalogue's", async () => {
    const sender = await createSender();
    await sender.sendEach([message({ title: "Words as sent", body: "Kept." })]);
    const msg = sendEach.mock.calls.at(-1)![0][0] as unknown as { notification: { title: string; body: string } };
    expect(msg.notification).toEqual({ title: "Words as sent", body: "Kept." });
  });

  it("every data value is a string, for every platform", async () => {
    for (const platform of ["android", "ios", "web"] as const) {
      const msg = (await sentFor(platform)) as unknown as { data: Record<string, unknown> };
      for (const [k, v] of Object.entries(msg.data)) expect(typeof v, `${platform}.${k}`).toBe("string");
    }
  });
});

describe("⚠ P1 - the sender branches on platform", () => {
  it("sends a WEB token data-only, with NO notification block", async () => {
    const msg = await sentFor("web");
    // With a `notification` block the Firebase js SDK shows the message too: two banners per event.
    expect(msg).not.toHaveProperty("notification");
    expect(msg).toHaveProperty("data");
    expect(msg).toHaveProperty("webpush");
  });

  it("gives mobile a notification block, android priority and APNs headers", async () => {
    for (const platform of ["android", "ios"] as const) {
      const msg = await sentFor(platform);
      expect(msg).toHaveProperty("notification");
      expect(msg).toHaveProperty("android");
      expect(msg).toHaveProperty("apns");
      expect(msg).not.toHaveProperty("webpush");
    }
  });

  it("puts the unseen count on the app icon for mobile, and nothing on the web (110 R8)", async () => {
    const msg = toFcmMessage(message({ platform: "ios", badge: 3 })) as unknown as {
      apns: { payload: { aps: { badge?: number } } };
      android: { notification?: { notificationCount?: number } };
    };
    expect(msg.apns.payload.aps.badge).toBe(3);
    expect(msg.android.notification?.notificationCount).toBe(3);
    const none = toFcmMessage(message({ platform: "android" })) as unknown as { apns: { payload: { aps: Record<string, unknown> } }; android: { notification: Record<string, unknown> } };
    expect(none.apns.payload.aps).not.toHaveProperty("badge");
    expect(none.android.notification).not.toHaveProperty("notificationCount");
    expect(toFcmMessage(message({ platform: "web", badge: 3 }))).not.toHaveProperty("apns");
  });

  it("files an Android push in its category's channel, and keeps the badge beside it (111 R12)", () => {
    const msg = toFcmMessage(message({ platform: "android", badge: 2, androidChannel: "offers_news" })) as unknown as {
      android: { notification?: { notificationCount?: number; channelId?: string } };
    };
    expect(msg.android.notification).toEqual({ notificationCount: 2, channelId: "offers_news", tag: message().notificationId });
    const web = toFcmMessage(message({ platform: "web", androidChannel: "orders" })) as unknown as Record<string, unknown>;
    expect(web).not.toHaveProperty("android");
  });

  it("carries a message's picture: in the notification block for mobile, in data for the web (112 R9)", () => {
    const url = "https://media.example.test/promotions/messages-1/a.webp";
    const mobile = toFcmMessage(message({ platform: "android", imageUrl: url })) as unknown as { notification: { imageUrl?: string }; data: Record<string, string> };
    expect(mobile.notification.imageUrl).toBe(url);
    const web = toFcmMessage(message({ platform: "web", imageUrl: url })) as unknown as { data: Record<string, string> };
    expect(web.data.image).toBe(url);
    const none = toFcmMessage(message({ platform: "android" })) as unknown as { notification: Record<string, unknown>; data: Record<string, string> };
    expect(none.notification).not.toHaveProperty("imageUrl");
    expect(none.data).not.toHaveProperty("image");
  });

  it("gives a web push a TTL, so a stale one expires rather than arriving late", async () => {
    const msg = (await sentFor("web")) as unknown as { webpush: { headers: Record<string, string> } };
    expect(Number(msg.webpush.headers.TTL)).toBeLessThanOrEqual(900);
    expect(msg.webpush.headers.Urgency).toBe("high");
  });
});

describe("batches", () => {
  it("splits into calls of at most 500 and returns one result per message, in order", async () => {
    const sender = await createSender();
    const n = FCM_BATCH_LIMIT * 2 + 7;
    const results = await sender.sendEach(Array.from({ length: n }, (_, i) => message({ token: `t${i}` })));
    expect(sendEach.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 7]);
    expect(results).toHaveLength(n);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("a failed call marks only its own messages failed (retryable, not pruned)", async () => {
    sendEach.mockRejectedValueOnce(Object.assign(new Error("down"), { code: "app/network-error" }));
    const sender = await createSender();
    const results = await sender.sendEach(Array.from({ length: FCM_BATCH_LIMIT + 1 }, () => message()));
    expect(results.slice(0, FCM_BATCH_LIMIT).every((r) => !r.ok && !r.prune && r.errorClass === "app/network-error")).toBe(true);
    expect(results[FCM_BATCH_LIMIT]).toEqual({ ok: true, prune: false });
  });
});

describe("dead-token pruning (FR-021)", () => {
  it.each([
    ["messaging/registration-token-not-registered", true],
    ["messaging/invalid-registration-token", true],
    // `invalid-argument` means our payload was malformed, not that the token is dead: never prune on it.
    ["messaging/invalid-argument", false],
    ["messaging/internal-error", false],
  ])("%s → prune=%s", async (code, prune) => {
    sendEach.mockResolvedValueOnce({ responses: [{ success: false, error: { code } }] });
    const sender = await createSender();
    const [r] = await sender.sendEach([message({ platform: "web" })]);
    expect(r).toEqual({ ok: false, prune, errorClass: code });
  });
});

describe("⚠ fail-open when unconfigured", () => {
  it("reports configured=false and fails every message rather than throwing", async () => {
    // `resetModules` is needed because the sender caches the Firebase app at module scope.
    vi.resetModules();
    delete process.env.FCM_SERVICE_ACCOUNT_ARN;
    const { createSender: freshSender } = await import("./sender");
    const sender = await freshSender();
    expect(sender.configured).toBe(false);
    await expect(sender.sendEach([message()])).resolves.toEqual([{ ok: false, prune: false, errorClass: "fcm_not_configured" }]);
    expect(sendEach).not.toHaveBeenCalled();
  });
});

describe("116 - the shown notification's tag, and urgency on iPhones", () => {
  it("every app push is tagged by its notification id on Android; the web is unchanged", () => {
    for (const platform of ["android", "ios"] as const) {
      const m = toFcmMessage(message({ platform })) as unknown as { android: { notification: { tag?: string } } };
      expect(m.android.notification.tag).toBe(message().notificationId);
    }
    expect(toFcmMessage(message({ platform: "web" }))).not.toHaveProperty("android");
  });

  it("carries the interruption level it is given, and none when absent", () => {
    for (const level of ["active", "passive", "time-sensitive"] as const) {
      const m = toFcmMessage(message({ platform: "ios", interruptionLevel: level })) as unknown as { apns: { payload: { aps: Record<string, unknown> } } };
      expect(m.apns.payload.aps["interruption-level"]).toBe(level);
    }
    const none = toFcmMessage(message({ platform: "ios" })) as unknown as { apns: { payload: { aps: Record<string, unknown> } } };
    expect(none.apns.payload.aps).not.toHaveProperty("interruption-level");
    expect(JSON.stringify(toFcmMessage(message({ platform: "ios", interruptionLevel: "time-sensitive" })))).not.toContain("critical");
  });
});

describe("116 - badge corrections are silent", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("iOS: the icon number only - an alert push with no alert, no sound, collapsing", () => {
    expect(toBadgeMessage({ token: "t", platform: "ios", count: 3, keep: ids })).toEqual({
      token: "t",
      apns: { headers: { "apns-push-type": "alert", "apns-priority": "5", "apns-collapse-id": "badge" }, payload: { aps: { badge: 3 } } },
    });
  });

  it("Android: data only, normal priority, collapsing; the keep list is bounded", () => {
    const m = toBadgeMessage({ token: "t", platform: "android", count: 0, keep: ids }) as unknown as {
      data: Record<string, string>; android: Record<string, unknown>; notification?: unknown;
    };
    expect(m.notification).toBeUndefined();
    expect(m.android).toEqual({ priority: "normal", collapseKey: "badge" });
    expect(m.data.type).toBe("badge");
    expect(m.data.count).toBe("0");
    expect(m.data.keep!.split(",")).toHaveLength(BADGE_KEEP_LIMIT);
    expect(Object.values(m.data).every((v) => typeof v === "string")).toBe(true);
  });

  it("sends badges in batches through the same sender", async () => {
    const sender = await createSender();
    const res = await sender.sendBadges([{ token: "a", platform: "ios", count: 1, keep: [] }, { token: "b", platform: "android", count: 1, keep: ["x"] }]);
    expect(res).toEqual([{ ok: true, prune: false }, { ok: true, prune: false }]);
  });
});
