/**
 * `@effy/web-kit` — the audience-neutral web runtime.
 *
 * Config, Amplify wiring, session/token access, the passwordless EMAIL_OTP flow, the route guard,
 * the server-state client, telemetry, and the client store. Every web surface consumes this; none
 * re-implements it (constitution Principle II).
 *
 * The SPA chrome lives at `@effy/web-kit/console`.
 */
export { createConfig, type Config, type EnvRecord } from "./runtime/config";
export { configureAmplify, type AmplifyPoolConfig } from "./runtime/amplify";
export { getAccessToken, getEmail, getGroups, getSubject } from "./runtime/auth-session";
export { createQueryClient } from "./runtime/query-client";
export {
  createTelemetry,
  type Telemetry,
  type TelemetryConfig,
  type TelemetryEvent,
} from "./runtime/telemetry";
export {
  createUiStore,
  type Theme,
  type UiState,
  type UiStore,
} from "./runtime/ui-store";

export {
  otpErrorMessage,
  hasSession,
  signOutUser,
  startSignIn,
  submitOtp,
  START_SIGN_IN_ERROR,
  type SignInOutcome,
} from "./auth/otp";
export {
  createSessionGuard,
  type SessionGuardOptions,
  type SessionLike,
  type SessionQueryLike,
} from "./auth/guards";
export type { NavItem } from "./console/nav";
