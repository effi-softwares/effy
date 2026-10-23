/**
 * The pure entrypoint: nothing reachable from here imports an AWS SDK, opens a socket or touches the
 * filesystem (a test holds it). The sender is `@effy/email-kit/send`.
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

// Pure env-config: the Cognito interceptor renders with these without the SES client.
export { identityFromEnv, MailConfigError, MAIL_ENV_KEYS } from "./config.js";

export { EMAIL_LAYOUT, EMAIL_TOKENS, EMAIL_TYPE, type EmailTokenRole } from "./generated/tokens.generated.js";
