import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ⚠ TYPED PARAMETERS, NOT `vi.fn(async () => …)`. An untyped mock gives `mock.calls` the type
// `[][]`, so reading `calls.at(-1)![0]` is a compile error — which `vitest run` does not surface
// because vitest does not run `tsc`. 029 recorded exactly that: a green test run over a failing
// typecheck.
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

/** The message object the sender handed to firebase-admin. */
async function sentFor(platform: "android" | "ios" | "web", type = "shop_new_order" as const) {
  const sender = await createSender();
  await sender.send("tok", type, "f-1", platform);
  return send.mock.calls.at(-1)![0];
}

describe("⚠ P1 — the sender branches on platform", () => {
  it("sends a WEB token data-only, with NO notification block", async () => {
    const msg = await sentFor("web");

    // ⚠ THE DEFECT THIS PREVENTS, and it does not look like a defect from the server side. With a
    // `notification` block present the Firebase JS SDK displays the message ITSELF — and our service
    // worker displays it too. The operator gets two identical banners for one order, the send
    // reports success, and nothing anywhere logs a problem.
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
      // ⚠ A web-only key reaching a mobile message would be harmless today and confusing forever.
      expect(msg).not.toHaveProperty("webpush");
    }
  });

  it("gives a web push a TTL, so a stale one expires rather than arriving late", async () => {
    const msg = (await sentFor("web")) as { webpush: { headers: Record<string, string> } };
    // A new-order notification eleven minutes late is worse than none: it tells an operator to
    // hurry for something already picked.
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
    // FCM rejects a non-string `data` value, and it does so one field deep in a provider error —
    // the send fails, the row retries, and the cause is nowhere near the symptom.
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
    // ⚠ `invalid-argument` USED TO PRUNE, AND THAT WAS WRONG. It means the MESSAGE was malformed —
    // the sender's fault, not the recipient's. Pruning on it deletes a working registration because
    // of a bug in our own payload, and the failure hides itself: the operator re-enables
    // notifications, the next send deletes the row again, and the drain reports a healthy
    // `skipped: no_token` forever. Changed in 059 after a live registration was destroyed this way.
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
    // ⚠ The operator has not seeded the service account yet. Rows stay pending for the deploy that
    // can send them. A throw here would take down the whole drain — and with it every other
    // audience's notifications — over a value nobody has supplied yet.
    //
    // ⚠ `resetModules` IS REQUIRED, and what it works around is deliberate production behaviour
    // rather than a defect: `sender.ts` caches the initialised Firebase app at module scope, so a
    // warm Lambda does not re-read the secret on every invocation. Within one test file that cache
    // outlives `delete process.env…`, and a test that skipped this would report "configured" for a
    // sender that genuinely has no credentials — agreeing with the earlier tests instead of with
    // the requirement.
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
