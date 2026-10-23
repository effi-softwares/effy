import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Typed mock parameters: an untyped `vi.fn` makes `mock.calls` `[][]`, which only tsc catches.
const send = vi.fn(async (_message: Record<string, unknown>) => "projects/x/messages/1");

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "test" })),
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({ send: (m: Record<string, unknown>) => send(m) })),
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

import { createSender } from "./sender";
import { NOTIFICATION_TYPES } from "../worker/copy";

beforeEach(() => {
  process.env.FCM_SERVICE_ACCOUNT_ARN = "arn:aws:secretsmanager:ap-southeast-2:1:secret:fcm";
  process.env.FCM_PROJECT_ID = "effy-dev";
  send.mockClear();
});
afterEach(() => vi.clearAllMocks());

async function sentFor(platform: "android" | "ios" | "web", type = "shop_new_order" as const) {
  const sender = await createSender();
  await sender.send("tok", type, "f-1", platform);
  return send.mock.calls.at(-1)![0];
}

describe("⚠ P1 — the sender branches on platform", () => {
  it("sends a WEB token data-only, with NO notification block", async () => {
    const msg = await sentFor("web");

    // With a `notification` block the Firebase js SDK shows the message too: two banners per event.
    expect(msg).not.toHaveProperty("notification");
    expect(msg).toHaveProperty("data");
    expect(msg).toHaveProperty("webpush");
  });

  it("keeps the mobile message byte-for-byte what it was before 059", async () => {
    for (const platform of ["android", "ios"] as const) {
      const msg = await sentFor(platform);
      expect(msg).toHaveProperty("notification");
      expect(msg).toHaveProperty("android");
      expect(msg).toHaveProperty("apns");
      expect(msg).not.toHaveProperty("webpush");
    }
  });

  it("gives a web push a TTL, so a stale one expires rather than arriving late", async () => {
    const msg = (await sentFor("web")) as { webpush: { headers: Record<string, string> } };
    // A new-order push eleven minutes late is worse than none.
    expect(Number(msg.webpush.headers.TTL)).toBeLessThanOrEqual(900);
    expect(msg.webpush.headers.Urgency).toBe("high");
  });

  it("carries the copy in `data` for web, since there is no notification block to hold it", async () => {
    const msg = (await sentFor("web")) as { data: Record<string, string> };
    expect(msg.data.title).toBe("New order to pick");
    expect(msg.data.webPath).toBe("/orders/f-1");
    expect(msg.data.tag).toBe("shop-new-order");
    expect(msg.data.group).toBe("orders");
  });
});

describe("⚠ P2 — every data value is a string, for every type and platform", () => {
  it("never hands FCM a non-string data value", async () => {
    // FCM rejects a non-string `data` value deep inside a provider error.
    for (const type of NOTIFICATION_TYPES) {
      for (const platform of ["android", "ios", "web"] as const) {
        const sender = await createSender();
        await sender.send("tok", type, "e-1", platform);
        const msg = send.mock.calls.at(-1)![0] as unknown as { data: Record<string, unknown> };
        for (const [k, v] of Object.entries(msg.data)) {
          expect(typeof v, `${type}/${platform}.${k}`).toBe("string");
        }
      }
    }
  });
});

describe("dead-token pruning survives the branch (FR-028)", () => {
  it.each([
    ["messaging/registration-token-not-registered", true],
    ["messaging/invalid-registration-token", true],
    // `invalid-argument` means our payload was malformed, not that the token is dead: never prune on it.
    ["messaging/invalid-argument", false],
    ["messaging/internal-error", false],
  ])("%s → prune=%s", async (code, prune) => {
    send.mockRejectedValueOnce(Object.assign(new Error("nope"), { code }));
    const sender = await createSender();
    const r = await sender.send("tok", "shop_new_order", "f-1", "web");
    expect(r.ok).toBe(false);
    expect(r.prune).toBe(prune);
    expect(r.errorClass).toBe(code);
  });
});

describe("⚠ fail-open when unconfigured (FR-027)", () => {
  it("reports configured=false and no-ops rather than throwing", async () => {
    // Not configured yet: rows stay pending rather than crashing the drain. `resetModules` is needed
    // because the sender caches the Firebase app at module scope.
    vi.resetModules();
    delete process.env.FCM_SERVICE_ACCOUNT_ARN;
    const { createSender: freshSender } = await import("./sender");
    const sender = await freshSender();
    expect(sender.configured).toBe(false);
    await expect(sender.send("tok", "shop_new_order", "f-1", "web")).resolves.toEqual({
      ok: false,
      prune: false,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
