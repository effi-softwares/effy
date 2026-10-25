/**
 * `@effy/web-kit`: the web runtime every surface shares (config, Amplify wiring, session access, the
 * email-code flow, the route guard, the server-state client, telemetry, the client store). The SPA
 * chrome is `@effy/web-kit/console`.
 */
export { createConfig, type Config, type EnvRecord } from "./runtime/config";
export { configureAmplify, type AmplifyPoolConfig } from "./runtime/amplify";
export { getAccessToken, getEmail, getGroups, getSubject } from "./runtime/auth-session";
export { createQueryClient } from "./runtime/query-client";
export { trackInputModality } from "./runtime/input-modality";
export {
  createTelemetry,
  wireGlobalErrorReporting,
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
// The live channel client (framework-free; the React provider is in./console).
export * from "./live";
