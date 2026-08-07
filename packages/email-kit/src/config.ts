/**
 * Mail configuration read from the environment. PURE — it reads `process.env` and nothing else.
 *
 * ⚠ THIS LIVES OUTSIDE `send.ts` ON PURPOSE. The Cognito `CustomMessage` interceptor RENDERS a
 * message and lets Cognito send it, so it needs the identity (for the footer) but must NOT pull the
 * SES client into a second Lambda that also sits behind Cognito's 5-second wall. Reading env config
 * is not sending, so it belongs on the pure side, re-exported by both `.` and `./send`.
 */

import type { MailIdentity } from "./audience.js";

export class MailConfigError extends Error {}

/**
 * Read the mail identity from the SSM-published contract (037 `ssm-mail.contract.md`).
 *
 * ⚠ NEVER A LITERAL. The sender used to be hardcoded in edge-auth AND edge-customer while Terraform
 * published a third copy in a different shape — and they had already drifted, so the Lambdas sent
 * with no display name while Cognito would have sent with one. One writer, many readers.
 */
export function identityFromEnv(): MailIdentity {
  const sender = process.env.MAIL_SENDER;
  if (!sender) {
    // ⚠ Configuration failure, not user data — safe to name, because it can only happen to a
    // misdeployed service and never as a result of anything a caller sent.
    throw new MailConfigError("MAIL_SENDER is not configured");
  }
  // ⚠ OPTIONAL, and this is a deliberate reversal of an earlier draft that threw here.
  //
  // The postal address is operator-supplied and MUST NOT be inferred (constitution: Real-World
  // Identifiers) — but "must not be guessed" is not "must be present." Every message shipping today
  // is TRANSACTIONAL, and transactional mail is CAN-SPAM-exempt from the physical-address
  // requirement (research R16). Throwing would make the platform's only credential for three
  // passwordless audiences depend on a value the operator has not yet supplied — a self-inflicted
  // sign-in outage traded for a footer line the law does not require on this class of mail.
  //
  // So an unset address is omitted from the footer (the template guards it with {{#if}}), and the
  // operator SHOULD supply it for trust and deliverability. ⚠ LIFECYCLE mail — which legally needs
  // the address — must enforce its presence at the point such a message is authored; there is none
  // in this slice.
  const postalAddress = process.env.MAIL_POSTAL_ADDRESS ?? "";
  const replyToPublic = process.env.MAIL_REPLY_TO ?? "";
  // ⚠ An UNSET-or-empty internal reply falls back to the public one, which preserves today's
  // behaviour (all four audiences reply to hello@). Once the operator publishes
  // `/effy/<env>/ses/reply_to_internal` (= the approved workspace-admin@ mailbox), internal
  // audiences route there instead — FR-037, activated by config, no code change. `??` alone is not
  // enough because serverless declares the var as an empty string when the SSM param is absent.
  const internalRaw = process.env.MAIL_REPLY_TO_INTERNAL;
  const replyToInternal = internalRaw && internalRaw.trim() ? internalRaw : replyToPublic;
  return { sender, replyToPublic, replyToInternal, postalAddress };
}

/**
 * ⚠ EVERY environment variable the mail path reads, named once.
 *
 * A service that routes mail through `@effy/email-kit` MUST declare all of these in its
 * `serverless.yml`, and a config-contract test in each service asserts exactly that — the guard
 * against 035's defect (four undeclared variables, no email ever sent, 100 tests missing it because
 * they set the variables themselves). The list is self-checked against the real source of BOTH
 * `config.ts` and `send.ts` in `test/send.test.ts`, so it cannot silently drift from what the code
 * actually reads.
 */
export const MAIL_ENV_KEYS = [
  "MAIL_SENDER",
  "MAIL_REPLY_TO",
  "MAIL_REPLY_TO_INTERNAL",
  "MAIL_CONFIGURATION_SET",
  "MAIL_POSTAL_ADDRESS",
] as const;
