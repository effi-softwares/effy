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
export type DevicePlatform = "android" | "ios";

export const DEVICE_PLATFORMS: readonly DevicePlatform[] = ["android", "ios"];

/** A recipient's active push address, as the worker needs it to send. */
export interface RecipientToken {
  fcmToken: string;
  platform: DevicePlatform;
}

/** Raised on a malformed registration; the handler maps it to a 400. */
export class DeviceValidationError extends Error {}

export interface DeviceRegistration {
  sub: string;
  audience: DeviceAudience;
  fcmToken: string;
  platform: DevicePlatform;
  appVersion?: string | null;
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
    throw new DeviceValidationError("platform must be one of android | ios");
  }
  await query(
    `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token, app_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fcm_token) DO UPDATE
        SET subject_sub  = EXCLUDED.subject_sub,
            audience     = EXCLUDED.audience,
            platform     = EXCLUDED.platform,
            app_version  = EXCLUDED.app_version,
            last_seen_at = now()`,
    [reg.sub, reg.audience, reg.platform, token, reg.appVersion ?? null],
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
    `SELECT fcm_token AS "fcmToken", platform
       FROM public.device_token
      WHERE subject_sub = $1 AND audience = $2`,
    [sub, audience],
  );
  return res.rows;
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
