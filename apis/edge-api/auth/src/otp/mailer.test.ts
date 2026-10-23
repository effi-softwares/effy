import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `mailer.ts` delegates to `@effy/email-kit/send`; these assert, through the SES mock, what reaches
 * SES and that the security rules hold (throw on failure, unknown user → simulator, code only in the message).
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
  for (const k of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET", "MAIL_POSTAL_ADDRESS"]) {
    delete process.env[k];
  }
  vi.resetModules();
});

describe("sendCode", () => {
  it("sends from MAIL_SENDER, display name included, to the recipient", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(lastInput().FromEmailAddress).toBe("Effy <no-reply@dev.effyshopping.com>");
    expect(lastInput().Destination.ToAddresses).toEqual(["person@example.com"]);
  });

  it("⚠ carries a reply address — 037 FR-022 reverses 010's FR-022", async () => {
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
    delete process.env.MAIL_CONFIGURATION_SET;
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(send).toHaveBeenCalledTimes(1);
    expect(lastInput().ConfigurationSetName).toBeUndefined();
  });

  it("⚠ tags the message with its template id — how 037's consumer attributes a bounce (038 FR-010)", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    expect(lastInput().EmailTags).toEqual([{ Name: "effy-template", Value: "auth-sign-in-code" }]);
  });

  it("⚠ sends a rendered HTML part AND a plain-text part, not the old text-only body", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false });

    const body = lastInput().Content.Simple.Body;
    expect(body.Html?.Data).toContain("<!doctype html>");
    expect(body.Html?.Data).toContain("123456");
    expect(body.Text?.Data).toContain("123456");
    // A purpose-written text part, not stripped HTML.
    expect(body.Text?.Data).not.toContain("<");
  });

  it("⚠ THROWS when the sender is unset — sending from a wrong address is worse than not sending", async () => {
    delete process.env.MAIL_SENDER;
    const { sendCode } = await loadMailer();

    await expect(
      sendCode({ to: "person@example.com", code: "123456", profile: PROFILE, phantom: false }),
    ).rejects.toThrow(/MAIL_SENDER/);
    expect(send).not.toHaveBeenCalled();
  });

  it("⚠ routes a phantom send to the simulator — 035's timing-parity defence, unbroken", async () => {
    // A real send on the same path, so latency does not reveal whether the account exists.
    const { sendCode } = await loadMailer();
    await sendCode({ to: "stranger@nowhere.test", code: "123456", profile: PROFILE, phantom: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(lastInput().Destination.ToAddresses).toEqual(["success@simulator.amazonses.com"]);
    expect(lastInput().FromEmailAddress).toBe("Effy <no-reply@dev.effyshopping.com>");
  });

  it("⚠ carries the code in the subject and the message body — and NOWHERE else in the request", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({ to: "person@example.com", code: "424242", profile: PROFILE, phantom: false });

    const input = lastInput();
    expect(input.Content.Simple.Subject.Data).toContain("424242");
    // The code appears in no tag, header, sender or reply address.
    expect(
      JSON.stringify({ ...input, Content: undefined, Destination: undefined }),
    ).not.toContain("424242");
  });

  it("addresses each internal audience by its own product name and wording", async () => {
    const { sendCode } = await loadMailer();
    await sendCode({
      to: "person@example.com",
      code: "555000",
      profile: { audience: "shop", productName: "Effy Shop", internal: true },
      phantom: false,
    });

    expect(lastInput().Content.Simple.Subject.Data).toContain("Effy Shop");
    expect(lastInput().Content.Simple.Body.Text.Data).toContain("work account");
  });
});
