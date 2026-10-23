/**
 * Mail configuration from the environment; pure. Separate from `send.ts` so the Cognito interceptor
 * (which renders and lets Cognito send) can read it without bundling the SES client.
 */

import type { MailIdentity } from "./audience.js";

export class MailConfigError extends Error {}

/** Reads the mail identity from the SSM-published contract; never a literal. */
export function identityFromEnv(): MailIdentity {
  const sender = process.env.MAIL_SENDER;
  if (!sender) {
    // A misdeployment, never caller data, so safe to name.
    throw new MailConfigError("MAIL_SENDER is not configured");
  }
  // Optional: the postal address is operator-supplied and never inferred, and transactional mail does
  // not legally need it, so its absence must not block a sign-in code. An unset address is omitted from
  // the footer. Lifecycle mail, which needs it, must enforce it when such a message exists.
  const postalAddress = process.env.MAIL_POSTAL_ADDRESS ?? "";
  const replyToPublic = process.env.MAIL_REPLY_TO ?? "";
  // An unset or empty internal reply falls back to the public one (serverless declares a missing SSM
  // param as ""), so `??` alone is not enough.
  const internalRaw = process.env.MAIL_REPLY_TO_INTERNAL;
  const replyToInternal = internalRaw && internalRaw.trim() ? internalRaw : replyToPublic;
  return { sender, replyToPublic, replyToInternal, postalAddress };
}

/**
 * Every environment variable the mail path reads. Each service that sends through `@effy/email-kit`
 * declares all of them in its `serverless.yml`, asserted by its config-contract test; the list itself
 * is checked against `config.ts` and `send.ts` in `test/send.test.ts`.
 */
export const MAIL_ENV_KEYS = [
  "MAIL_SENDER",
  "MAIL_REPLY_TO",
  "MAIL_REPLY_TO_INTERNAL",
  "MAIL_CONFIGURATION_SET",
  "MAIL_POSTAL_ADDRESS",
] as const;
