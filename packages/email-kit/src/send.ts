import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { profileFor, replyAddressFor, type Audience } from "./audience.js";
import { CATALOG, type TemplateId, type VarsFor } from "./catalog.js";
import { identityFromEnv } from "./config.js";
import { render } from "./render.js";

const PHANTOM_RECIPIENT = "success@simulator.amazonses.com";

let client: SESv2Client | undefined;

export interface SendOptions {
  readonly to: string;
  readonly audience: Audience;
  readonly phantom?: boolean;
}

export interface SendResult {
  readonly templateId: TemplateId;
  readonly messageId: string | undefined;
  readonly outcome: "sent" | "failed";
  readonly durationMs: number;
}

export interface SendLogger {
  info(fields: Record<string, unknown>, msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}

export async function sendEmail<T extends TemplateId>(
  id: T,
  vars: VarsFor<T>,
  options: SendOptions,
  logger?: SendLogger,
): Promise<SendResult> {
  const started = Date.now();
  const entry = CATALOG[id];
  const fields = { template_id: id, audience: options.audience, outcome: "failed", duration_ms: 0 };

  try {
    if (entry.sentBy !== "platform") {
      throw new Error(`'${id}' is sent by Cognito and must not be sent through this path`);
    }
    const identity = identityFromEnv();
    const message = render(id, vars, options.audience, identity);
    const replyTo = replyAddressFor(profileFor(options.audience), identity);
    const configurationSet = process.env.MAIL_CONFIGURATION_SET;

    client ??= new SESv2Client({});
    const response = await client.send(
      new SendEmailCommand({
        FromEmailAddress: identity.sender,
        Destination: { ToAddresses: [options.phantom ? PHANTOM_RECIPIENT : options.to] },
        ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        EmailTags: [{ Name: "effy-template", Value: id }],
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: message.html, Charset: "UTF-8" },
              Text: { Data: message.text, Charset: "UTF-8" },
            },
            Headers: [{ Name: "X-Effy-Template", Value: id }],
          },
        },
      }),
    );

    const durationMs = Date.now() - started;
    logger?.info(
      { ...fields, outcome: "sent", duration_ms: durationMs, message_id: response.MessageId },
      "email sent",
    );
    return { templateId: id, messageId: response.MessageId, outcome: "sent", durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const rethrow = entry.onSendFailure === "throw";
    logger?.error(
      { ...fields, duration_ms: durationMs, err: err instanceof Error ? err.name : "unknown" },
      rethrow ? "email send failed — the caller must refuse" : "email send failed — continuing",
    );
    if (rethrow) throw err;
    return { templateId: id, messageId: undefined, outcome: "failed", durationMs };
  }
}

export function resetMailerForTests(): void {
  client = undefined;
}
