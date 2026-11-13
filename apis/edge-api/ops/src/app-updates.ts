// 121: checking and publishing the apps' update settings - the logic behind `make app-updates[-check]`
// (publish-app-updates.ts is the command line). Git, AWS and the file system come in as [AppUpdatePorts], so the
// refusals are tested without either.
//
//   config/app-updates/<env>/<app>.json  →  s3://<media bucket>/app-updates/<app>.json  →  https://media.<zone>/…
import {
  APP_UPDATE_APPS,
  APP_UPDATE_ENVS,
  validateAppUpdateSettings,
  type AppUpdateApp,
  type AppUpdateEnv,
} from "@effy/shared-types";

export const APP_UPDATES_PREFIX = "app-updates";
export const APP_UPDATES_CACHE_CONTROL = "public, max-age=60";

export interface AppUpdatePorts {
  /** The file's text, or null when it does not exist. */
  readFile(relativePath: string): string | null;
  /** True when the file has changes git has not committed (or is not tracked at all). */
  isUncommitted(relativePath: string): Promise<boolean>;
  headCommit(): Promise<string>;
  ssmParameter(name: string): Promise<string>;
  putObject(input: { bucket: string; key: string; body: string; contentType: string; cacheControl: string; commit: string }): Promise<void>;
  invalidate(distributionId: string, paths: string[]): Promise<void>;
  log(line: string): void;
}

export function settingsPath(env: AppUpdateEnv, app: AppUpdateApp): string {
  return `config/app-updates/${env}/${app}.json`;
}

export function isEnv(value: string): value is AppUpdateEnv {
  return (APP_UPDATE_ENVS as readonly string[]).includes(value);
}

export function isApp(value: string): value is AppUpdateApp {
  return (APP_UPDATE_APPS as readonly string[]).includes(value);
}

/** One file's problems (empty when it may be published). */
export function checkFile(ports: AppUpdatePorts, env: AppUpdateEnv, app: AppUpdateApp): string[] {
  const path = settingsPath(env, app);
  const text = ports.readFile(path);
  if (text === null) return [`${path}: missing`];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return [`${path}: not JSON (${e instanceof Error ? e.message : String(e)})`];
  }
  const result = validateAppUpdateSettings(parsed, { env, app });
  return result.ok ? [] : result.errors.map((err) => `${path}: ${err}`);
}

/** `make app-updates-check`: every environment and app. */
export function checkAll(ports: AppUpdatePorts): string[] {
  return APP_UPDATE_ENVS.flatMap((env) => APP_UPDATE_APPS.map((app) => checkFile(ports, env, app))).flat();
}

/**
 * `make app-updates ENV=<env> [APP=<app>]`. Refuses - sending nothing - when any chosen file is invalid or has
 * uncommitted changes (git history is the record of every change, FR-019). Then uploads each file and clears the CDN's
 * copy once, so phones see the change within the minute.
 */
export async function publish(ports: AppUpdatePorts, env: AppUpdateEnv, apps: readonly AppUpdateApp[]): Promise<void> {
  const problems: string[] = [];
  for (const app of apps) {
    problems.push(...checkFile(ports, env, app));
    if (await ports.isUncommitted(settingsPath(env, app))) {
      problems.push(`${settingsPath(env, app)}: has uncommitted changes - commit it first, so the history records what went live`);
    }
  }
  if (problems.length) throw new Error(`nothing published:\n  ${problems.join("\n  ")}`);

  const bucket = await ports.ssmParameter(`/effy/${env}/media/bucket`);
  const distributionId = await ports.ssmParameter(`/effy/${env}/app_updates/distribution_id`);
  const publicBase = await ports.ssmParameter(`/effy/${env}/media/public_base_url`);
  const commit = await ports.headCommit();
  for (const app of apps) {
    const key = `${APP_UPDATES_PREFIX}/${app}.json`;
    await ports.putObject({
      bucket,
      key,
      body: ports.readFile(settingsPath(env, app))!,
      contentType: "application/json",
      cacheControl: APP_UPDATES_CACHE_CONTROL,
      commit,
    });
    ports.log(`published ${settingsPath(env, app)} → s3://${bucket}/${key} (commit ${commit.slice(0, 12)})`);
  }
  await ports.invalidate(distributionId, [`/${APP_UPDATES_PREFIX}/*`]);
  ports.log(`cleared the CDN copy (/${APP_UPDATES_PREFIX}/*) - phones act on it within about 3 minutes`);
  for (const app of apps) ports.log(`check: curl -sI ${publicBase}/${APP_UPDATES_PREFIX}/${app}.json`);
}
