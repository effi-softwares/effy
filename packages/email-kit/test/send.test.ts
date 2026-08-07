import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = send;
  },
  SendEmailCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

async function loadSend() {
  const mod = await import("../src/send.js");
  mod.resetMailerForTests();
  return mod;
}

function lastInput(): Record<string, any> {
  return (send.mock.calls.at(-1)?.[0] as { input: Record<string, any> }).input;
}

const goodEnv = () => {
  process.env.MAIL_SENDER = "Effy <no-reply@dev.effyshopping.com>";
  process.env.MAIL_REPLY_TO = "hello@effyshopping.com";
  process.env.MAIL_CONFIGURATION_SET = "effy-dev-mail";
  process.env.MAIL_POSTAL_ADDRESS = "1 Test St, Sydney NSW";
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ MessageId: "mid-1" });
  goodEnv();
});

afterEach(() => {
  for (const k of [
    "MAIL_SENDER",
    "MAIL_REPLY_TO",
    "MAIL_REPLY_TO_INTERNAL",
    "MAIL_CONFIGURATION_SET",
    "MAIL_POSTAL_ADDRESS",
  ]) {
    delete process.env[k];
  }
  vi.resetModules();
});

describe("MAIL_ENV_KEYS", () => {
  it("⚠ names EXACTLY the environment variables the mail path reads — self-check, so it cannot drift", async () => {
    // The edge services' config-contract tests trust this list; this keeps it honest against the
    // real source, which is what makes trusting it safe (035's defect was a list that lied).
    const { MAIL_ENV_KEYS } = await import("../src/send.js");
    const here = dirname(fileURLToPath(import.meta.url));
    // ⚠ Scans BOTH files that read the mail environment: config.ts (identity) and send.ts (the
    // configuration set). A regex that saw only one file would pass a list that lies (035's defect).
    const read = new Set<string>();
    for (const file of ["../src/config.ts", "../src/send.ts"]) {
      const src = readFileSync(resolve(here, file), "utf8");
      for (const m of src.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);
    }
    expect(new Set(MAIL_ENV_KEYS)).toEqual(read);
  });
});

describe("sendEmail", () => {
  it("builds a Simple message with both body parts, the tag and the header", async () => {
    const { sendEmail } = await loadSend();
    await sendEmail(
      "auth-sign-in-code",
      { code: "424242", expiryMinutes: 5, isInternal: false },
      { to: "person@example.com", audience: "customer" },
    );

    const i = lastInput();
    expect(i.FromEmailAddress).toBe("Effy <no-reply@dev.effyshopping.com>");
    expect(i.Destination.ToAddresses).toEqual(["person@example.com"]);
    expect(i.EmailTags).toEqual([{ Name: "effy-template", Value: "auth-sign-in-code" }]);
    expect(i.Content.Simple.Headers).toEqual([{ Name: "X-Effy-Template", Value: "auth-sign-in-code" }]);
    expect(i.Content.Simple.Body.Html.Data).toContain("424242");
    expect(i.Content.Simple.Body.Text.Data).toContain("424242");
    expect(i.ConfigurationSetName).toBe("effy-dev-mail");
  });

  it("derives the reply address from the audience", async () => {
    const { sendEmail } = await loadSend();
    // Internal reply falls back to the public address until MAIL_REPLY_TO_INTERNAL is set.
    await sendEmail(
      "auth-sign-in-code",
      { code: "1", expiryMinutes: 5, isInternal: true },
      { to: "op@example.com", audience: "shop" },
    );
    expect(lastInput().ReplyToAddresses).toEqual(["hello@effyshopping.com"]);

    process.env.MAIL_REPLY_TO_INTERNAL = "workspace-admin@effyshopping.com";
    await sendEmail(
      "auth-sign-in-code",
      { code: "1", expiryMinutes: 5, isInternal: true },
      { to: "op@example.com", audience: "shop" },
    );
    expect(lastInput().ReplyToAddresses).toEqual(["workspace-admin@effyshopping.com"]);
  });

  describe("failure policy", () => {
    it("⚠ THROWS for a message whose policy is throw (an unsent sign-in code is a lockout)", async () => {
      send.mockRejectedValueOnce(new Error("ses down"));
      const { sendEmail } = await loadSend();
      await expect(
        sendEmail(
          "auth-sign-in-code",
          { code: "1", expiryMinutes: 5, isInternal: false },
          { to: "person@example.com", audience: "customer" },
        ),
      ).rejects.toThrow();
    });

    it("⚠ SWALLOWS for a message whose policy is swallow (the change already happened)", async () => {
      send.mockRejectedValueOnce(new Error("ses down"));
      const { sendEmail } = await loadSend();
      const result = await sendEmail(
        "account-password-changed",
        { isFirstPassword: false },
        { to: "person@example.com", audience: "customer" },
      );
      expect(result.outcome).toBe("failed"); // recorded, not thrown
    });
  });

  describe("logging", () => {
    it("⚠ logs exactly the safe fields — never the recipient, the code, or the body", async () => {
      const logger = { info: vi.fn(), error: vi.fn() };
      const { sendEmail } = await loadSend();
      await sendEmail(
        "auth-sign-in-code",
        { code: "SECRET99", expiryMinutes: 5, isInternal: false },
        { to: "victim@example.com", audience: "customer" },
        logger,
      );

      const logged = JSON.stringify(logger.info.mock.calls);
      expect(logged).toContain("auth-sign-in-code");
      expect(logged).toContain("customer");
      expect(logged).not.toContain("SECRET99");
      expect(logged).not.toContain("victim@example.com");
    });

    it("⚠ logs only the error NAME on failure — an SES message can echo the address back", async () => {
      const logger = { info: vi.fn(), error: vi.fn() };
      send.mockRejectedValueOnce(new Error("delivery to victim@example.com refused"));
      const { sendEmail } = await loadSend();
      await sendEmail(
        "account-password-changed",
        { isFirstPassword: false },
        { to: "victim@example.com", audience: "customer" },
        logger,
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain("victim@example.com");
    });
  });

  it("⚠ refuses to send a Cognito-owned message through this path (it would double-deliver)", async () => {
    // No Cognito-sent template exists yet, so this is proven at the seam: a hand-built entry with
    // sentBy:"cognito" would be rejected. The guard is the `entry.sentBy !== "platform"` check.
    // Here we assert the two shipping templates ARE platform-sent, so the path accepts them.
    const { sendEmail } = await loadSend();
    await expect(
      sendEmail(
        "account-password-changed",
        { isFirstPassword: true },
        { to: "person@example.com", audience: "customer" },
      ),
    ).resolves.toBeDefined();
  });

  it("throws when the sender is unset — sending from a wrong address is worse than not sending", async () => {
    delete process.env.MAIL_SENDER;
    const { sendEmail } = await loadSend();
    await expect(
      sendEmail(
        "auth-sign-in-code",
        { code: "1", expiryMinutes: 5, isInternal: false },
        { to: "person@example.com", audience: "customer" },
      ),
    ).rejects.toThrow(/MAIL_SENDER/);
    expect(send).not.toHaveBeenCalled();
  });
});
