import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handler } from "./custom-message.js";
import type { CustomMessageEvent } from "../otp/types.js";
import { resetAudienceIndexForTests } from "../lib/audience.js";

/**
 * ⚠ The overriding property under test is: THIS TRIGGER NEVER THROWS. A CustomMessage trigger that
 * throws fails the whole Cognito operation — sign-up or password recovery does not complete. Every
 * failure path must instead return the event UNMODIFIED so Cognito uses its own default template.
 */

const CUSTOMER_POOL = "ap-southeast-2_CUSTOMER";
const SHOP_POOL = "ap-southeast-2_SHOP";

function makeEvent(triggerSource: string, userPoolId = CUSTOMER_POOL): CustomMessageEvent {
  return {
    version: "1",
    region: "ap-southeast-2",
    userPoolId,
    triggerSource,
    userName: "user-123",
    callerContext: { awsSdkVersion: "x", clientId: "client-1" },
    request: {
      userAttributes: { email: "person@example.com", email_verified: "false" },
      codeParameter: "{####}",
    },
    response: { smsMessage: null, emailMessage: null, emailSubject: null },
  };
}

beforeEach(() => {
  resetAudienceIndexForTests();
  process.env.CUSTOMER_USER_POOL_ID = CUSTOMER_POOL;
  process.env.SHOP_USER_POOL_ID = SHOP_POOL;
  process.env.DRIVER_USER_POOL_ID = "ap-southeast-2_DRIVER";
  process.env.BACK_OFFICE_USER_POOL_ID = "ap-southeast-2_BACKOFFICE";
  process.env.MAIL_SENDER = "Effy <no-reply@dev.effyshopping.com>";
  process.env.MAIL_REPLY_TO = "hello@effyshopping.com";
  process.env.MAIL_POSTAL_ADDRESS = "1 Test St, Sydney NSW";
});

afterEach(() => {
  for (const k of [
    "CUSTOMER_USER_POOL_ID",
    "SHOP_USER_POOL_ID",
    "DRIVER_USER_POOL_ID",
    "BACK_OFFICE_USER_POOL_ID",
    "MAIL_SENDER",
    "MAIL_REPLY_TO",
    "MAIL_POSTAL_ADDRESS",
    "MAIL_REPLY_TO_INTERNAL",
  ]) {
    delete process.env[k];
  }
  vi.restoreAllMocks();
  resetAudienceIndexForTests();
});

describe("CustomMessage interceptor — branding", () => {
  it("renders the sign-up code email for a customer sign-up", async () => {
    const out = await handler(makeEvent("CustomMessage_SignUp"));
    expect(out.response.emailSubject).toBe("Confirm your email for Effy");
    expect(out.response.emailMessage).toContain("<!doctype html>");
    // ⚠ The placeholder is emitted verbatim — Cognito substitutes the real code after we return.
    expect(out.response.emailMessage).toContain("{####}");
  });

  it.each([
    ["CustomMessage_SignUp", "Confirm your email for Effy"],
    ["CustomMessage_ResendCode", "Confirm your email for Effy"],
    ["CustomMessage_ForgotPassword", "Reset your Effy password"],
    ["CustomMessage_VerifyUserAttribute", "Verify your email for Effy"],
    ["CustomMessage_UpdateUserAttribute", "Verify your email for Effy"],
    ["CustomMessage_Authentication", "Your Effy verification code"],
  ])("maps %s to the right subject", async (trigger, subject) => {
    const out = await handler(makeEvent(trigger));
    expect(out.response.emailSubject).toBe(subject);
    expect(out.response.emailMessage).toContain("{####}");
  });

  it("brands email verification for an internal audience by its own product name", async () => {
    // email verification is ALL_AUDIENCES, so a shop-pool verification renders (not falls back).
    const out = await handler(makeEvent("CustomMessage_VerifyUserAttribute", SHOP_POOL));
    expect(out.response.emailSubject).toBe("Verify your email for Effy Shop");
  });
});

describe("CustomMessage interceptor — the fail-safe (never throws, returns unmodified)", () => {
  it("passes through an unmapped trigger (e.g. AdminCreateUser) unmodified", async () => {
    const out = await handler(makeEvent("CustomMessage_AdminCreateUser"));
    expect(out.response.emailMessage).toBeNull();
    expect(out.response.emailSubject).toBeNull();
  });

  it("passes through a completely unknown trigger source unmodified", async () => {
    const out = await handler(makeEvent("CustomMessage_SomethingNew"));
    expect(out.response.emailMessage).toBeNull();
  });

  it("⚠ fails CLOSED on an unknown pool — never guesses an audience", async () => {
    const out = await handler(makeEvent("CustomMessage_SignUp", "ap-southeast-2_STRANGER"));
    expect(out.response.emailMessage).toBeNull();
    expect(out.response.emailSubject).toBeNull();
  });

  it("⚠ passes through when the template does not serve that audience", async () => {
    // sign-up is customer-only; a shop-pool sign-up (should never happen) must not throw.
    const out = await handler(makeEvent("CustomMessage_SignUp", SHOP_POOL));
    expect(out.response.emailMessage).toBeNull();
  });

  it("⚠ passes through when MAIL_SENDER is unconfigured, rather than throwing", async () => {
    delete process.env.MAIL_SENDER;
    const out = await handler(makeEvent("CustomMessage_SignUp"));
    expect(out.response.emailMessage).toBeNull();
    expect(out.response.emailSubject).toBeNull();
  });

  it("⚠ passes through if Cognito's code placeholder is not the one the template baked in", async () => {
    // Our templates hardcode {####}. If Cognito ever passed a different token, the code would not be
    // substituted and the message would ship a literal placeholder — so we fall back instead.
    const event = makeEvent("CustomMessage_SignUp");
    (event.request as { codeParameter: string }).codeParameter = "{code}";
    const out = await handler(event);
    expect(out.response.emailMessage).toBeNull();
  });

  it("⚠ NEVER throws on any of these paths", async () => {
    delete process.env.MAIL_SENDER;
    // Each of these hits a different failure branch; none may reject.
    await expect(handler(makeEvent("CustomMessage_SignUp"))).resolves.toBeDefined();
    await expect(handler(makeEvent("CustomMessage_SignUp", "ap-southeast-2_STRANGER"))).resolves.toBeDefined();
    await expect(handler(makeEvent("CustomMessage_Unknown"))).resolves.toBeDefined();
  });
});

describe("CustomMessage interceptor — the fallback metric is meaningful", () => {
  // ⚠ `custom_message_fallback` must fire ONLY when a message we SHOULD have branded failed — not on
  // a benign pass-through. Otherwise an alarm on it cries wolf on every un-branded flow.
  function metricsFrom(lines: string[]): string[] {
    return lines
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((o): o is Record<string, unknown> => !!o && "_aws" in o)
      .flatMap((o) =>
        (o._aws as { CloudWatchMetrics: { Metrics: { Name: string }[] }[] }).CloudWatchMetrics.flatMap(
          (m) => m.Metrics.map((x) => x.Name),
        ),
      );
  }

  it("does NOT emit a fallback metric on a benign unmapped trigger", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l?: unknown) => void lines.push(String(l)));
    await handler(makeEvent("CustomMessage_AdminCreateUser"));
    expect(metricsFrom(lines)).not.toContain("custom_message_fallback");
  });

  it("DOES emit a fallback metric when a brandable message fails to render", async () => {
    delete process.env.MAIL_SENDER; // forces the render path to throw → render_error
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l?: unknown) => void lines.push(String(l)));
    await handler(makeEvent("CustomMessage_SignUp"));
    expect(metricsFrom(lines)).toContain("custom_message_fallback");
  });

  it("emits `rendered`, not `fallback`, on the happy path", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l?: unknown) => void lines.push(String(l)));
    await handler(makeEvent("CustomMessage_SignUp"));
    const metrics = metricsFrom(lines);
    expect(metrics).toContain("custom_message_rendered");
    expect(metrics).not.toContain("custom_message_fallback");
  });
});

describe("CustomMessage interceptor — log discipline", () => {
  it("⚠ never logs the recipient address or the rendered body", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line?: unknown) => {
      logged.push(String(line));
    });

    // A render that succeeds (emits a log via emit's EMF) and a fallback (emits a warn line).
    await handler(makeEvent("CustomMessage_SignUp"));
    await handler(makeEvent("CustomMessage_SignUp", SHOP_POOL)); // audience mismatch → fallback

    const all = logged.join("\n");
    expect(all).not.toContain("person@example.com");
    expect(all).not.toContain("<!doctype html>");
    expect(all).not.toContain("email_verified");
  });

  it("⚠ changes only emailMessage and emailSubject — never a code's lifetime or the request", async () => {
    const event = makeEvent("CustomMessage_SignUp");
    const before = JSON.stringify(event.request);
    const out = await handler(event);
    // The request (which carries the code parameter and user attributes) is untouched.
    expect(JSON.stringify(out.request)).toBe(before);
    // SMS is left exactly as received.
    expect(out.response.smsMessage).toBeNull();
  });
});
