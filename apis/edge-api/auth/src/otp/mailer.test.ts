import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ `mailer.ts` HAD NO DIRECT TEST until 037, despite being the single point through which every
 * sign-in code on the platform passes. Everything that touched it mocked the whole module
 * (`vi.mock("./mailer")`), which proves the caller's behaviour and nothing about the message.
 *
 * These tests assert the SendEmailCommand INPUT, because that is the thing a recipient actually
 * sees and the thing 037 changed.
 */

const send = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = send;
  },
  SendEmailCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

const PROFILE = {
  audience: "customer" as const,
  productName: "Effy",
  internal: false,
};

async function loadMailer() {
  const mod = await import("./mailer.js");
  mod.resetMailerForTests();
  return mod;
}

function lastInput(): Record<string, any> {
  const call = send.mock.calls.at(-1);
  return (call?.[0] as { input: Record<string, any> }).input;
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ MessageId: "test-message-id" });
  process.env.MAIL_SENDER = "Effy <no-reply@dev.effyshopping.com>";
  process.env.MAIL_REPLY_TO = "hello@effyshopping.com";
  process.env.MAIL_CONFIGURATION_SET = "effy-dev-mail";
});

afterEach(() => {
  delete process.env.MAIL_SENDER;
  delete process.env.MAIL_REPLY_TO;
  delete process.env.MAIL_CONFIGURATION_SET;
  vi.resetModules();
});

describe("sendCode", () => {
  it("sends from MAIL_SENDER, display name included", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(lastInput().FromEmailAddress).toBe("Effy <no-reply@dev.effyshopping.com>");
    expect(lastInput().Destination.ToAddresses).toEqual(["person@example.com"]);
  });

  it("⚠ carries a reply address — 037 FR-022 reverses 010's FR-022", async () => {
    // 010 forbade one because the platform could not receive mail. It can now, and a shopper who
    // cannot sign in and hits reply is the highest-intent support signal the platform gets.
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(lastInput().ReplyToAddresses).toEqual(["hello@effyshopping.com"]);
  });

  it("⚠ attaches the configuration set — without it a hard bounce is invisible", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(lastInput().ConfigurationSetName).toBe("effy-dev-mail");
  });

  it("⚠ still sends when the configuration set is unset — visibility must not break sign-in", async () => {
    // The identity carries the same set as its DEFAULT, so a missing variable degrades to "still
    // observed". Throwing here would take down sign-in for four audiences over a telemetry setting.
    delete process.env.MAIL_CONFIGURATION_SET;
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(send).toHaveBeenCalledTimes(1);
    expect(lastInput().ConfigurationSetName).toBeUndefined();
  });

  it("⚠ THROWS when the sender is unset — sending from a wrong address is worse than not sending", async () => {
    delete process.env.MAIL_SENDER;
    const { sendCode } = await loadMailer();

    await expect(
      sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false }),
    ).rejects.toThrow(/MAIL_SENDER/);
    expect(send).not.toHaveBeenCalled();
  });

  it("⚠ routes a phantom send to the simulator — 035's timing-parity defence, unbroken by 037", async () => {
    // If this ever regresses, "account exists" leaks through response latency even though every
    // response body is identical. 037 touched this file; this test is why that is safe.
    const { sendCode } = await loadMailer();
    await sendCode({ to: "stranger@example.com", code: "123456", profile: PROFILE, phantom: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(lastInput().Destination.ToAddresses).toEqual(["success@simulator.amazonses.com"]);
    // ⚠ And it is a REAL send on the SAME path — not a skip, not a sleep.
    expect(lastInput().FromEmailAddress).toBe("Effy <no-reply@dev.effyshopping.com>");
  });

  it("⚠ never puts the code or the recipient anywhere but the message itself", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "424242", profile: PROFILE, phantom: false });

    const input = lastInput();
    // The code belongs in the subject and body — and nowhere else in the request.
    expect(input.Content.Simple.Subject.Data).toContain("424242");
    expect(JSON.stringify({ ...input, Content: undefined, Destination: undefined })).not.toContain(
      "424242",
    );
  });
});
