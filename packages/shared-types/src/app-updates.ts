// App update settings (121): the file each mobile app reads at launch to learn whether it must, should or may update.
//
//   config/app-updates/<env>/<app>.json  →  https://media.<zone>/app-updates/<app>.json   (make app-updates ENV=<env>)
//
// Three build numbers per platform, always minimum ≤ recommended ≤ latest:
//   build < minimum      → mandatory (a full screen; the app cannot be used)
//   build < recommended  → optional  (a sheet with Update now / Later at every launch)
//   build < latest       → notice    (the same sheet, once per latest build)
//
// This file holds the shape and the publisher's checks (`validateAppUpdateSettings`, run by `make app-updates`). The
// decision itself runs on the phone, in Kotlin (`packages/mobile-kit/common/update/AppUpdateDecision.kt`);
// `decideAppUpdate` here is its twin, and both are pinned to `app-updates.fixtures.json` (app-updates.test.ts also
// fails a Kotlin copy of the fixtures that drifts).

export type AppUpdateApp = "customer" | "driver";
export type AppUpdateEnv = "dev" | "prod";
export type AppUpdatePlatform = "ios" | "android";

export const APP_UPDATE_SCHEMA = 1 as const;
export const APP_UPDATE_APPS: readonly AppUpdateApp[] = ["customer", "driver"];
export const APP_UPDATE_ENVS: readonly AppUpdateEnv[] = ["dev", "prod"];

/** Each app's Android application id. A dev build may carry the same id plus `.dev`. */
export const APP_UPDATE_ANDROID_IDS: Record<AppUpdateApp, string> = {
  customer: "com.effyshopping.customer.mobile",
  driver: "com.effyshopping.driver.mobile",
};

export interface PlatformUpdateSettings {
  minimum: number;
  recommended: number;
  latest: number;
  /** Where Update now leads. Null only in dev (then Update now is not offered). */
  storeUrl: string | null;
}

export interface AppUpdateSettings {
  schema: typeof APP_UPDATE_SCHEMA;
  ios: PlatformUpdateSettings;
  android: PlatformUpdateSettings;
}

export type AppUpdateOutcome =
  | { level: "mandatory" }
  | { level: "optional" }
  | { level: "notice"; latest: number }
  | { level: "none" };

export type AppUpdateValidation =
  | { ok: true; settings: AppUpdateSettings }
  | { ok: false; errors: string[] };

const PLATFORM_KEYS = ["minimum", "recommended", "latest", "storeUrl"] as const;
const IOS_STORE_URL = /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/(?:[a-z0-9-]+\/)?id(\d+)$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBuild(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** A placeholder App Store id: all zeros, or one digit repeated (id0000000000, id1111111111). */
function isPlaceholderAppStoreId(id: string): boolean {
  return /^(\d)\1*$/.test(id);
}

function checkPlatform(
  platform: AppUpdatePlatform,
  value: unknown,
  env: AppUpdateEnv,
  app: AppUpdateApp,
  errors: string[],
): void {
  const at = (msg: string) => errors.push(`${platform}: ${msg}`);
  if (!isRecord(value)) {
    at("missing, or not an object");
    return;
  }
  for (const key of Object.keys(value)) {
    if (!(PLATFORM_KEYS as readonly string[]).includes(key)) at(`unknown key "${key}"`);
  }
  for (const key of ["minimum", "recommended", "latest"] as const) {
    if (!isBuild(value[key])) at(`${key} must be a whole number of 0 or more (got ${JSON.stringify(value[key])})`);
  }
  const { minimum, recommended, latest, storeUrl } = value;
  if (isBuild(minimum) && isBuild(recommended) && minimum > recommended) {
    at(`minimum (${minimum}) is above recommended (${recommended})`);
  }
  if (isBuild(recommended) && isBuild(latest) && recommended > latest) {
    at(`recommended (${recommended}) is above latest (${latest})`);
  }

  if (storeUrl === null || storeUrl === undefined) {
    if (storeUrl === undefined) at(`storeUrl is missing (use null when there is none)`);
    const anyAboveZero = [minimum, recommended, latest].some((n) => isBuild(n) && n > 0);
    if (env === "prod" && anyAboveZero) at("storeUrl is required in prod once any build number is above 0");
    return;
  }
  if (typeof storeUrl !== "string") {
    at("storeUrl must be a string or null");
    return;
  }
  if (/[<>]/.test(storeUrl)) {
    at("storeUrl is a placeholder - the operator supplies the real store page");
    return;
  }
  if (platform === "ios") {
    const m = IOS_STORE_URL.exec(storeUrl);
    if (!m) at("storeUrl must look like https://apps.apple.com/au/app/id<digits>");
    else if (isPlaceholderAppStoreId(m[1]!)) at("storeUrl has a placeholder App Store id");
  } else {
    const id = APP_UPDATE_ANDROID_IDS[app];
    const allowed = [id, `${id}.dev`].map((i) => `https://play.google.com/store/apps/details?id=${i}`);
    if (!allowed.includes(storeUrl)) {
      at(`storeUrl must be the ${app} app's own Play page (https://play.google.com/store/apps/details?id=${id})`);
    }
  }
}

/**
 * The publisher's check (FR-017): every rule a file must pass before `make app-updates` sends it to phones.
 * Stricter than the phone's own reading, which only needs the shape and the order of the numbers.
 */
export function validateAppUpdateSettings(
  value: unknown,
  where: { env: AppUpdateEnv; app: AppUpdateApp },
): AppUpdateValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["the file is not a JSON object"] };
  if (value.schema !== APP_UPDATE_SCHEMA) errors.push(`schema must be ${APP_UPDATE_SCHEMA}`);
  for (const key of Object.keys(value)) {
    if (!["schema", "ios", "android"].includes(key)) errors.push(`unknown key "${key}"`);
  }
  checkPlatform("ios", value.ios, where.env, where.app, errors);
  checkPlatform("android", value.android, where.env, where.app, errors);
  return errors.length ? { ok: false, errors } : { ok: true, settings: value as unknown as AppUpdateSettings };
}

/**
 * The decision (FR-001), the twin of Kotlin `decideAppUpdate`. `storeAllows` is false only on an Android install from
 * Play when Play says this phone cannot get the update yet (a staged rollout); mandatory never asks the store.
 */
export function decideAppUpdate(input: {
  settings: AppUpdateSettings | null;
  platform: AppUpdatePlatform;
  build: number;
  noticeShownFor: number | null;
  storeAllows: boolean;
}): AppUpdateOutcome {
  const { settings, platform, build, noticeShownFor, storeAllows } = input;
  if (!settings) return { level: "none" };
  const p = settings[platform];
  if (build < p.minimum) return { level: "mandatory" };
  if (build < p.recommended && storeAllows) return { level: "optional" };
  if (build < p.latest && noticeShownFor !== p.latest && storeAllows) return { level: "notice", latest: p.latest };
  return { level: "none" };
}
