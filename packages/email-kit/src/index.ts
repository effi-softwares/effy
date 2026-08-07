/**
 * `@effy/email-kit` — the PURE entrypoint.
 *
 * ⚠ NOTHING REACHABLE FROM HERE MAY IMPORT AN AWS SDK, OPEN A SOCKET, OR TOUCH THE FILESYSTEM.
 * The sender lives behind `@effy/email-kit/send`, and a test asserts this boundary holds. It is what
 * lets `make email-preview`, every lint check and every unit test run with no cloud access at all.
 */

export {
  CATALOG,
  TEMPLATE_ID_GRAMMAR,
  entryFor,
  isTemplateId,
  messageTagFor,
  templateIds,
  validateVars,
  type Category,
  type FailurePolicy,
  type MessageDefinition,
  type MessageEntry,
  type SentBy,
  type TemplateId,
  type VarShape,
  type VarSpec,
  type VarsFor,
  type VarsOf,
} from "./catalog.js";

export {
  platformVars,
  profileFor,
  replyAddressFor,
  type Audience,
  type AudienceProfile,
  type MailIdentity,
} from "./audience.js";

export { render, type RenderedMessage } from "./render.js";

// ⚠ Pure env-config, safe to import from the `.` entrypoint: reading configuration is not sending.
// The Cognito interceptor uses these to render without pulling in the SES client.
export { identityFromEnv, MailConfigError, MAIL_ENV_KEYS } from "./config.js";

export { EMAIL_LAYOUT, EMAIL_TOKENS, EMAIL_TYPE, type EmailTokenRole } from "./generated/tokens.generated.js";
