// Device push-token registration — shared by every cold-path service that registers a mobile device
// (edge-customer, edge-shop, edge-driver), and read by the notifications worker.
//
// ── Principle II ────────────────────────────────────────────────────────────────────────────────
// One shape, three mountings. Each service exposes POST/DELETE /{audience}/v1/devices behind its own
// pool's authorizer, but the SQL is identical, so it lives here — not copy-pasted three ways that
// would drift the first time either is touched (the same reason `media` was promoted here by 028).
//
// Raw SQL, no ORM (Principle VI). No PII: a token is opaque, audience/platform are closed enums, the
// owner is the verified `sub` (never a body field). See
// specs/050-observability-push-foundation/contracts/device-registration.contract.md.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { query } from "./db";
import { type AuthedEvent, subject } from "./claims";
import { preamble, problem, ProblemType, type RequestScope } from "./http";
import { parseJsonBody } from "../validate";

/** A 204 No Content, correctly bodiless. */
function noContent(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
}

export type DeviceAudience = "customer" | "shop" | "driver";

/**
 * Where a push address lives.
 *
 * ⚠ 059 ADDED `"web"`, and that one value is the whole of what stood between a paid order and the
 * shop being told about it. Since 050 core-api has enqueued a `shop_new_order` intent per active
 * staff member of every fulfilling shop; the worker resolves those to `device_token` rows; and a
 * browser could not be one. Every intent was recorded, attempted and discarded as "nobody to send
 * to". The shop audience works in a WEB console.
 *
 * ⚠ KEEP IN SYNC with `packages/shared-types/src/device.ts`, which declares the same union.
 * `edge-shared` deliberately does not depend on `@effy/shared-types` (every other edge service
 * does), so the two are duplicated rather than shared; `devices.test.ts` pins them to the same set
 * so widening one alone fails.
 */
export type DevicePlatform = "android" | "ios" | "web";

export const DEVICE_PLATFORMS: readonly DevicePlatform[] = ["android", "ios", "web"];

/**
 * A recipient's active push address, as the worker needs it to send.
 *
 * ⚠ `platform` IS NOT DECORATION HERE ANY MORE. Before 059 the sender ignored it and emitted one
 * message shape for every token — which, given a browser, does not fail: it silently sends a
 * mobile-shaped message that makes the Firebase SDK display a banner on top of the one our service
 * worker shows. The sender now branches on this field.
 */
export interface RecipientToken {
  fcmToken: string;
  platform: DevicePlatform;
  /**
   * 059 — types this registration has opted out of.
   *
   * ⚠ OPTIONAL, and absent means "nothing muted". Making it required would force every existing
   * mobile test fixture to change, which would destroy the proof that matters most about this
   * widening: that edge-customer's and edge-driver's suites pass UNMODIFIED. A field whose absence
   * is the pre-059 behaviour should not be able to break the tests that describe that behaviour.
   */
  mutedTypes?: string[];
}

/** Raised on a malformed registration; the handler maps it to a 400. */
export class DeviceValidationError extends Error {}

export interface DeviceRegistration {
  sub: string;
  audience: DeviceAudience;
  fcmToken: string;
  platform: DevicePlatform;
  appVersion?: string | null;
  /**
   * 059 — per-registration notification preferences (web only).
   *
   * ⚠ `undefined` and `[]` MEAN DIFFERENT THINGS, and conflating them is the defect this field is
   * shaped to avoid. `undefined` = "leave what is stored alone", which is what the console's
   * every-launch registration refresh sends, so it cannot silently reset a choice the operator
   * made. `[]` = "clear them". The discriminator is the PRESENCE OF THE KEY.
   *
   * 056 shipped the inverse of this defect — `COALESCE($n, col)` cannot tell "leave alone" from
   * "clear", so a driver's zone, once assigned, was permanent.
   */
  mutedTypes?: string[] | null;
}

/**
 * Register or refresh a device token. Idempotent by construction: UPSERT on the UNIQUE `fcm_token`,
 * so a rotation replaces the value and re-registering the same device never duplicates a row (SC-009).
 * A device handed to another signed-in user re-points to the new subject on conflict (shared-device
 * safety pairs with the sign-out DELETE below).
 */
export async function registerDevice(reg: DeviceRegistration): Promise<void> {
  const token = reg.fcmToken?.trim();
  if (!token) throw new DeviceValidationError("fcmToken is required");
  if (!DEVICE_PLATFORMS.includes(reg.platform)) {
    throw new DeviceValidationError(`platform must be one of ${DEVICE_PLATFORMS.join(" | ")}`);
  }

  // ⚠ REFUSED on mobile, not ignored (059 contract C3). The mobile apps have no preference UI;
  // accepting and discarding the field would make a future mobile preferences slice believe it was
  // already wired. Refusing names the situation.
  const wantsPreferences = reg.mutedTypes !== undefined && reg.mutedTypes !== null;
  if (wantsPreferences && reg.platform !== "web") {
    throw new DeviceValidationError("mutedTypes is only accepted for platform web");
  }
  if (wantsPreferences && !reg.mutedTypes!.every((t) => typeof t === "string")) {
    throw new DeviceValidationError("mutedTypes must be an array of strings");
  }

  // ⚠ THE PRESENCE OF THE KEY DECIDES, NOT THE EMPTINESS OF THE VALUE. When the caller sent no
  // `mutedTypes`, the stored array is kept (the unqualified `device_token.muted_types` on the right of the
  // COALESCE); when it sent one — including `[]` — it replaces wholesale. The console re-registers
  // on every launch without the field, so without this branch every launch would silently turn
  // muted notifications back on.
  await query(
    `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token, app_version, muted_types)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::text[], '{}'))
     ON CONFLICT (fcm_token) DO UPDATE
        SET subject_sub  = EXCLUDED.subject_sub,
            audience     = EXCLUDED.audience,
            platform     = EXCLUDED.platform,
            app_version  = EXCLUDED.app_version,
            muted_types  = COALESCE($6::text[], device_token.muted_types),
            last_seen_at = now()`,
    [
      reg.sub,
      reg.audience,
      reg.platform,
      token,
      reg.appVersion ?? null,
      wantsPreferences ? reg.mutedTypes : null,
    ],
  );
}

/**
 * Unregister a token — only if it belongs to the caller (FR-020). Idempotent: deleting an absent or
 * not-owned token is a no-op. Called on sign-out and when notifications are disabled.
 */
export async function unregisterDevice(sub: string, fcmToken: string): Promise<void> {
  await query(`DELETE FROM public.device_token WHERE fcm_token = $1 AND subject_sub = $2`, [
    fcmToken,
    sub,
  ]);
}

/** All active push addresses for a recipient (the worker's per-recipient resolve). */
export async function tokensForRecipient(
  sub: string,
  audience: DeviceAudience,
): Promise<RecipientToken[]> {
  const res = await query<RecipientToken>(
    `SELECT fcm_token AS "fcmToken", platform, muted_types AS "mutedTypes"
       FROM public.device_token
      WHERE subject_sub = $1 AND audience = $2`,
    [sub, audience],
  );
  return res.rows;
}

/**
 * Read one registration, for the preferences screen (059).
 *
 * ⚠ Scoped to the caller's own subject. "Not yours" and "no such token" are indistinguishable by
 * design — both return null — so the route built on this cannot become an oracle for which tokens
 * exist on the platform.
 */
export async function readRegistration(
  sub: string,
  fcmToken: string,
): Promise<{ platform: DevicePlatform; mutedTypes: string[] } | null> {
  const res = await query<{ platform: DevicePlatform; mutedTypes: string[] }>(
    `SELECT platform, muted_types AS "mutedTypes"
       FROM public.device_token
      WHERE fcm_token = $1 AND subject_sub = $2`,
    [fcmToken, sub],
  );
  return res.rows[0] ?? null;
}

/**
 * Replace one registration's muted types (059 FR-024).
 *
 * Returns false when the token is not the caller's, or does not exist — the caller maps both to an
 * identical 404 for the reason above. Replaces WHOLESALE: `[]` is a meaningful value ("everything
 * on"), not an absence.
 */
export async function setMutedTypes(
  sub: string,
  fcmToken: string,
  mutedTypes: string[],
): Promise<boolean> {
  const res = await query(
    `UPDATE public.device_token
        SET muted_types = $3::text[]
      WHERE fcm_token = $1 AND subject_sub = $2`,
    [fcmToken, sub, mutedTypes],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Remove a dead token (FCM reported it unregistered/invalid). Called by the worker (FR-018). */
export async function pruneToken(fcmToken: string): Promise<void> {
  await query(`DELETE FROM public.device_token WHERE fcm_token = $1`, [fcmToken]);
}

// ── Lambda handler factories ─────────────────────────────────────────────────────────────────────
// Each service's function file is a one-liner: `export const handler = makeDevicePostHandler("shop")`.
// The audience is fixed per service (a driver token can only be registered through the driver route,
// behind the driver authorizer), so it is a factory argument, never a body field.

/** POST /{audience}/v1/devices — register/refresh this device's token for the authenticated subject. */
export function makeDevicePostHandler(audience: DeviceAudience) {
  return async (
    event: AuthedEvent,
    context: Context,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) {
      return problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        `a valid token for the ${audience} audience is required`,
        scope,
      );
    }
    const body = parseJsonBody<Record<string, unknown>>(event.body);
    if (body.errors.length > 0 || !body.value) {
      return problem(
        400,
        ProblemType.ValidationFailed,
        "Invalid request",
        body.errors[0]?.message ?? "the request body is not valid JSON",
        scope,
      );
    }
    try {
      await registerDevice({
        sub,
        audience,
        fcmToken: typeof body.value.fcmToken === "string" ? body.value.fcmToken : "",
        platform: body.value.platform as DevicePlatform,
        appVersion: typeof body.value.appVersion === "string" ? body.value.appVersion : null,
        // ⚠ `undefined` when the key is absent, so `registerDevice` can tell "leave the stored
        // preferences alone" from "clear them". `"mutedTypes" in body.value` rather than a
        // truthiness check, because `[]` is falsy in neither JS nor this contract — it is a value.
        mutedTypes: "mutedTypes" in body.value
          ? (body.value.mutedTypes as string[] | null)
          : undefined,
      });
      return noContent(scope);
    } catch (err) {
      if (err instanceof DeviceValidationError) {
        return problem(400, ProblemType.ValidationFailed, "Invalid request", err.message, scope);
      }
      throw err;
    }
  };
}

/** DELETE /{audience}/v1/devices/{token} — unregister, only if the token belongs to the caller. */
export function makeDeviceDeleteHandler(_audience: DeviceAudience) {
  return async (
    event: AuthedEvent,
    context: Context,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) {
      return problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid token is required",
        scope,
      );
    }
    const token = event.pathParameters?.token;
    if (!token) {
      return problem(
        400,
        ProblemType.ValidationFailed,
        "Invalid request",
        "a device token path parameter is required",
        scope,
      );
    }
    await unregisterDevice(sub, decodeURIComponent(token));
    return noContent(scope);
  };
}
