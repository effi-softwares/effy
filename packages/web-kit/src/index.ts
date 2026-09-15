/**
 * `@effy/web-kit` — the audience-neutral web runtime.
 *
 * Config, Amplify wiring, session/token access, the passwordless email one-time code flow, the route guard,
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
  wireGlobalErrorReporting,
  type Telemetry,
  type TelemetryConfig,
  type TelemetryEvent,
} from "./runtime/telemetry";
// 058: the authenticated SSE reader. Shared because it is audience-neutral runtime plumbing — the
// shop console uses it today, and back-office's own live screens will want the same one, not a
// second copy (Principle II).
export { openLiveStream, parseFrame, type LiveEvent, type LiveStreamOptions } from "./runtime/live";
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
