/** `@effy/email-kit/send`: the only place an SES client exists. */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { profileFor, replyAddressFor, type Audience } from "./audience.js";
import { CATALOG, messageTagFor, type MessageEntry, type TemplateId, type VarsFor } from "./catalog.js";
import { identityFromEnv } from "./config.js";
import { render } from "./render.js";

// Re-exported for existing importers; render-only callers import them from the pure `.` entrypoint.
export { identityFromEnv, MailConfigError, MAIL_ENV_KEYS } from "./config.js";

/** Module scope: Cognito abandons a trigger at 5 seconds, and the budget is shared with a DynamoDB write and an SES call. */
let client: SESv2Client | undefined;
function ses(): SESv2Client {
  client ??= new SESv2Client({});
  return client;
}

/**
 * Ses's mailbox simulator, a security control: with no account we must not mail a stranger, but
 * skipping the send would leak account existence through latency. Sending here keeps the same path.
 */
export const BLACKHOLE = "success@simulator.amazonses.com";

export interface SendOptions {
  readonly to: string;
  readonly audience: Audience;
  /** When true the message goes to the simulator instead of `to` (blackhole). */
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

/**
 * Sends one catalogued message. The generic keeps call sites to the right variables, and the message,
 * not the caller, decides what happens on failure (`throw` or `swallow`).
 */
export async function sendEmail<T extends TemplateId>(
  id: T,
  vars: VarsFor<T>,
  options: SendOptions,
  logger?: SendLogger,
): Promise<SendResult> {
  const started = Date.now();
  const entry = CATALOG[id] as MessageEntry;
  const profile = profileFor(options.audience);

  const finish = (outcome: SendResult["outcome"], messageId?: string): SendResult => ({
    templateId: id,
    messageId,
    outcome,
    durationMs: Date.now() - started,
  });

  try {
    if (entry.sentBy !== "platform") {
      // Cognito owns these. Sending one ourselves would double-deliver.
      throw new Error(`'${id}' is sent by Cognito — it must not be sent through this path`);
    }

    const identity = identityFromEnv();
    const destination = options.phantom ? BLACKHOLE : options.to;

    const message = render(id, vars, options.audience, identity);
    const replyTo = replyAddressFor(profile, identity);
    const configurationSet = process.env.MAIL_CONFIGURATION_SET;

    const response = await ses().send(
      new SendEmailCommand({
        FromEmailAddress: identity.sender,
        Destination: { ToAddresses: [destination] },
        ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
        // Optional at runtime: a missing value degrades to the default set; its absence is caught by the config-contract test.
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        // Attribution: the tag reaches the SES event as `mail.tags`, which the deliverability consumer
        // writes to email_delivery_event.template_id. The header is the human-readable twin.
        EmailTags: [{ Name: "effy-template", Value: messageTagFor(id) }],
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              // Both parts, always: HTML-only mail trips SpamAssassin's MIME_HTML_ONLY.
              Html: { Data: message.html, Charset: "UTF-8" },
              Text: { Data: message.text, Charset: "UTF-8" },
            },
            Headers: [{ Name: "X-Effy-Template", Value: id }],
          },
        },
      }),
    );

    const result = finish("sent", response.MessageId);
    // Exactly five fields: never the address, the code or rendered content.
    logger?.info(
      {
        template_id: id,
        audience: options.audience,
        outcome: "sent",
        duration_ms: result.durationMs,
        message_id: result.messageId,
      },
      "email sent",
    );
    return result;
  } catch (err) {
    const result = finish("failed");
    logger?.error(
      {
        template_id: id,
        audience: options.audience,
        outcome: "failed",
        duration_ms: result.durationMs,
        // The error name only: an SES message can echo the destination address.
        err: err instanceof Error ? err.name : "unknown",
      },
      entry.onSendFailure === "throw"
        ? "email send failed — the caller must refuse"
        : "email send failed — recorded and continuing, the underlying change already happened",
    );
    if (entry.onSendFailure === "throw") throw err;
    return result;
  }
}

/** Test seam: the client is built once per container. */
export function resetMailerForTests(): void {
  client = undefined;
}
