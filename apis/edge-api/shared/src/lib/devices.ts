// Device push-token registration for every service that registers a device (customer, shop, driver),
// read by the notifications worker. Each service mounts POST/DELETE /{audience}/v1/devices behind its
// own authorizer; the SQL lives here. A token is opaque; the owner is the verified `sub`.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { query } from "./db";
import { type AuthedEvent, subject } from "./claims";
import { preamble, problem, ProblemType, type RequestScope } from "./http";
import { parseJsonBody } from "../validate";

function noContent(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
}

export type DeviceAudience = "customer" | "shop" | "driver";

/** Where a push address lives; `"web"` is the shop console. */
export type DevicePlatform = "android" | "ios" | "web";

export const DEVICE_PLATFORMS: readonly DevicePlatform[] = ["android", "ios", "web"];

/** The sender branches on `platform`: web and mobile need different message shapes. */
export interface RecipientToken {
  fcmToken: string;
  platform: DevicePlatform;
  /** Types this registration has opted out of; absent means nothing muted. */
  mutedTypes?: string[];
}

/** The handler maps it to a 400. */
export class DeviceValidationError extends Error {}

export interface DeviceRegistration {
  sub: string;
  audience: DeviceAudience;
  fcmToken: string;
  platform: DevicePlatform;
  appVersion?: string | null;
  /** Web only. `undefined` leaves the stored value (the console's every-launch refresh); `[]` clears. The key's presence decides. */
  mutedTypes?: string[] | null;
}

/**
 * Idempotent: UPSERT on the unique `fcm_token`, so a rotation replaces it and re-registering never
 * duplicates. A device handed to another user re-points to the new subject.
 */
export async function registerDevice(reg: DeviceRegistration): Promise<void> {
  const token = reg.fcmToken?.trim();
  if (!token) throw new DeviceValidationError("fcmToken is required");
  if (!DEVICE_PLATFORMS.includes(reg.platform)) {
    throw new DeviceValidationError(`platform must be one of ${DEVICE_PLATFORMS.join(" | ")}`);
  }

  // Refused on mobile, not ignored: the apps have no preference UI.
  const wantsPreferences = reg.mutedTypes !== undefined && reg.mutedTypes !== null;
  if (wantsPreferences && reg.platform !== "web") {
    throw new DeviceValidationError("mutedTypes is only accepted for platform web");
  }
  if (wantsPreferences && !reg.mutedTypes!.every((t) => typeof t === "string")) {
    throw new DeviceValidationError("mutedTypes must be an array of strings");
  }

  // No `mutedTypes` keeps the stored array (the COALESCE); any value, `[]` included, replaces it.
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

/** Only if it belongs to the caller; idempotent. On sign-out and when notifications are disabled. */
export async function unregisterDevice(sub: string, fcmToken: string): Promise<void> {
  await query(`DELETE FROM public.device_token WHERE fcm_token = $1 AND subject_sub = $2`, [
    fcmToken,
    sub,
  ]);
}

/** The worker's per-recipient resolve. */
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

/** For the preferences screen, scoped to the caller: "not yours" and "no such token" both return null. */
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

/** false when not the caller's or missing (an identical 404). Replaces wholesale: `[]` means everything on. */
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

/** FCM reported it unregistered or invalid. */
export async function pruneToken(fcmToken: string): Promise<void> {
  await query(`DELETE FROM public.device_token WHERE fcm_token = $1`, [fcmToken]);
}

// Handler factories: `export const handler = makeDevicePostHandler("shop")`. The audience is fixed per service, never a body field.

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
        // `undefined` when the key is absent, so "leave alone" is distinct from "clear".
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
