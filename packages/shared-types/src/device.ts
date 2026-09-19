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

/**
 * Where a push address lives.
 *
 * ⚠ 059 ADDED `"web"`. 050's comment here read "Web push is out of scope this slice", and that
 * sentence was true when written and false from the moment the shop console could register. A
 * shared contract that contradicts the live one is two sources for one fact.
 *
 * ⚠ THIS FILE IS DORMANT, AND THAT IS WHY IT WAS ALMOST MISSED. It is exported from the package
 * index and imported by nothing — the edge services and the mobile apps each declare their own
 * shape. 059's reader audit found it by grep, not by a failing build, which is precisely how a
 * contradiction here would have sat unnoticed.
 *
 * ⚠ IT DUPLICATES `apis/edge-api/shared/src/lib/devices.ts` rather than being imported by it,
 * because `edge-shared` deliberately does not depend on `@effy/shared-types` (every other edge
 * service does). Collapsing them would restructure seven Lambda bundles, which 059 is not the slice
 * to do. The duplication is pre-existing and now PINNED: both sides carry the same list and each
 * has a test asserting it, so a future widening of one alone fails.
 */
export type DevicePlatform = "android" | "ios" | "web";

/** The canonical set, in one place, so a test can pin it against the edge library's copy. */
export const DEVICE_PLATFORMS: readonly DevicePlatform[] = ["android", "ios", "web"];

/**
 * Register or refresh a device's FCM token.
 *
 * Idempotent by construction: the server upserts on `fcmToken`, so a rotation replaces the value and
 * a re-register from the same device never creates a duplicate row (SC-009).
 */
export interface DeviceRegistrationRequest {
  /** The opaque FCM registration token for this app install. */
  fcmToken: string;
  /** Which platform issued the token. */
  platform: DevicePlatform;
  /** The app build string, for triage only (non-PII, optional). */
  appVersion?: string;
  /**
   * 059 — notification types this registration does not want (opt-out; absent/empty = all on).
   *
   * ⚠ WEB ONLY. The mobile apps have no preference UI, and accepting-then-discarding the field
   * would make a future mobile preferences slice believe it was already wired. The server refuses
   * it with a 400 on android/ios rather than ignoring it.
   *
   * ⚠ ABSENT AND EMPTY MEAN DIFFERENT THINGS. Absent leaves the stored preferences untouched, so
   * the registration refresh the console makes on every launch cannot silently reset a choice the
   * operator made. `[]` clears them. The distinction is the PRESENCE OF THE KEY, never the
   * emptiness of the value — 056 shipped the inverse defect, where COALESCE meant a field could
   * never be cleared at all.
   */
  mutedTypes?: string[];
}
