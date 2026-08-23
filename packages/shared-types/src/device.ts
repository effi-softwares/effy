/**
 * Device push-token contracts — 050-observability-push-foundation.
 *
 * The shape a mobile app sends to register (or refresh) the FCM token for one app install on one
 * device. One shape, three mountings — each behind its own pool's authorizer on the shared gateway
 * (edge-customer `/customer/v1/devices`, edge-shop `/shop/v1/devices`, edge-driver
 * `/driver/v1/devices`) — all writing `public.device_token`.
 *
 * ⚠ THE OWNER IS NEVER ON THE WIRE. `subject_sub` is taken from the verified JWT, never from the
 * body — a caller cannot register a token against someone else's subject (auth isolation, FR-012).
 *
 * ⚠ NO PII. The token is opaque, `platform`/`audience` are closed enums, and `appVersion` is a build
 * string — nothing here identifies a person beyond the subject the gateway already authenticated
 * (Principle VII; FR-021/022).
 *
 * Contract: specs/050-observability-push-foundation/contracts/device-registration.contract.md ·
 * Data: specs/050-observability-push-foundation/data-model.md
 */

/** The four audiences that can own a device token. Admin has no mobile app, so it is absent. */
export type DeviceAudience = "customer" | "shop" | "driver";

/** The two mobile platforms. Web push is out of scope this slice (ARCHITECTURE.md). */
export type DevicePlatform = "android" | "ios";

/**
 * Register or refresh a device's FCM token.
 *
 * Idempotent by construction: the server upserts on `fcmToken`, so a rotation replaces the value and
 * a re-register from the same device never creates a duplicate row (SC-009).
 */
export interface DeviceRegistrationRequest {
  /** The opaque FCM registration token for this app install. */
  fcmToken: string;
  /** Which mobile platform issued the token. */
  platform: DevicePlatform;
  /** The app build string, for triage only (non-PII, optional). */
  appVersion?: string;
}
