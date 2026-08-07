/**
 * `@effy/email-kit/send` — the ONLY place an SES client exists.
 *
 * Contract: specs/038-email-template-system/contracts/email-catalog.contract.md §3
 *
 * ⚠ Everything reachable from `@effy/email-kit` (the `.` entrypoint) is pure. This module is the
 * adapter, and it is separate so that preview, lint and every unit test run with no cloud access.
 */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { profileFor, replyAddressFor, type Audience } from "./audience.js";
import { CATALOG, messageTagFor, type MessageEntry, type TemplateId, type VarsFor } from "./catalog.js";
import { identityFromEnv, MailConfigError } from "./config.js";
import { render } from "./render.js";

// ⚠ Re-exported so existing importers of `@effy/email-kit/send` (the config-contract tests, edge
// services) keep working after the pure config moved to config.ts. New render-only callers (the
// Cognito interceptor) should import these from the pure `.` entrypoint instead.
export { identityFromEnv, MailConfigError, MAIL_ENV_KEYS } from "./config.js";

/**
 * ⚠ Module scope, not per-invocation. Cognito abandons a trigger at 5 seconds and a cold start
 * already costs ~1 s; constructing an SDK client per call spends part of a budget shared with a
 * DynamoDB write and an SES round trip.
 */
let client: SESv2Client | undefined;
function ses(): SESv2Client {
  client ??= new SESv2Client({});
  return client;
}

/**
 * SES's documented mailbox simulator.
 *
 * ⚠ THIS IS A SECURITY CONTROL, NOT A TEST FIXTURE (035 FR-016 / spec FR-052). When an address has
 * no account we must not mail a stranger — but skipping the send makes the phantom path return
 * measurably faster than the real one, and account existence then leaks through LATENCY even though
 * every response body is identical. Sending to the simulator keeps the same call on the same path,
 * so the timing distribution matches by construction rather than by a sleep somebody guessed.
 */
export const BLACKHOLE = "success@simulator.amazonses.com";

export interface SendOptions {
  readonly to: string;
  readonly audience: Audience;
  /** When true the message goes to the simulator instead of `to` — see BLACKHOLE. */
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
 * Send one catalogued message.
 *
 * ⚠ The generic is the whole point: a call site cannot compile with the wrong variables, and
 * `TemplateId` being closed means "template not found" is not a runtime failure class.
 *
 * ⚠ THE CALLER DOES NOT CHOOSE WHAT HAPPENS ON FAILURE — the message does. `throw` for a sign-in
 * code (an unsent code is a lockout on three audiences with no password); `swallow` for a
 * password-change notice (the change already happened and cannot be unwound, so failing the request
 * would tell the customer a lie).
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
        // ⚠ Optional at runtime ON PURPOSE. The identity carries the same set as its DEFAULT, so a
        // missing variable degrades to "still observed" rather than "sign-in broken" — throwing here
        // would take down four audiences over a telemetry setting. Its ABSENCE is caught at build
        // time instead, by the config-contract test.
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        // ⚠ ATTRIBUTION. The tag surfaces in the SES event payload as `mail.tags`, which 037's
        // consumer writes to email_delivery_event.template_id — so "which message is bouncing?" is
        // answerable without a join through application state. The header is the human-readable
        // twin, for reading a raw message.
        EmailTags: [{ Name: "effy-template", Value: messageTagFor(id) }],
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              // ⚠ BOTH PARTS, ALWAYS. SES assembles the multipart/alternative for us. HTML-only mail
              // trips SpamAssassin's MIME_HTML_ONLY, and several Android clients take the inbox
              // preview line from the text part.
              Html: { Data: message.html, Charset: "UTF-8" },
              Text: { Data: message.text, Charset: "UTF-8" },
            },
            Headers: [{ Name: "X-Effy-Template", Value: id }],
          },
        },
      }),
    );

    const result = finish("sent", response.MessageId);
    // ⚠ Exactly five fields. NEVER the address, the code, or any rendered content — which is why the
    // mailer this replaces had no logging at all.
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
        // ⚠ The error NAME only. An SES error message can echo the destination address back.
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

/** Test seam — the client is built once per container. */
export function resetMailerForTests(): void {
  client = undefined;
}
