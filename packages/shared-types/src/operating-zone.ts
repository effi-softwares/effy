/**
 * Effy's clock: delivery days, windows, cutoffs, "today" and every printed date, wherever a device is.
 * One value per environment, `operating_timezone` in `infra/envs/<env>/<env>.tfvars` (steps:
 * README.md, "Switching the time zone"). Melbourne when nothing sets it.
 *
 * Build-time everywhere: nothing reads it while running. `define` in each stack's esbuild block and each
 * console's vite.config.ts, and `env` in customer-web's next.config.ts, replace `process.env.OPERATING_TZ`
 * in the bundle, so it must stay written out in full here. The customer app's twin comes from its Gradle
 * build, which reads the same tfvars line.
 */
declare const process: { env: Record<string, string | undefined> };

export const OPERATING_TZ = process.env.OPERATING_TZ || "Australia/Melbourne";

/** The zone's city, for "Times are Colombo time." */
export const OPERATING_CITY = OPERATING_TZ.slice(OPERATING_TZ.lastIndexOf("/") + 1).replaceAll("_", " ");
