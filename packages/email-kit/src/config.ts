import type { MailIdentity } from "./audience.js";

export class MailConfigError extends Error {}

export const MAIL_ENV_KEYS = [
  "MAIL_SENDER",
  "MAIL_REPLY_TO",
  "MAIL_REPLY_TO_INTERNAL",
  "MAIL_CONFIGURATION_SET",
  "MAIL_POSTAL_ADDRESS",
] as const;

export function identityFromEnv(): MailIdentity {
  const sender = process.env.MAIL_SENDER;
  if (!sender) throw new MailConfigError("MAIL_SENDER is not configured");
  const replyToPublic = process.env.MAIL_REPLY_TO ?? "";
  return {
    sender,
    replyToPublic,
    replyToInternal: process.env.MAIL_REPLY_TO_INTERNAL?.trim() || replyToPublic,
    postalAddress: process.env.MAIL_POSTAL_ADDRESS ?? "",
  };
}
