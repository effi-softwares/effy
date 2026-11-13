import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APP_UPDATE_APPS,
  APP_UPDATE_ENVS,
  decideAppUpdate,
  validateAppUpdateSettings,
  type AppUpdateApp,
  type AppUpdateEnv,
  type AppUpdateOutcome,
  type AppUpdatePlatform,
  type AppUpdateSettings,
} from "./app-updates";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const SOURCE = resolve(here, "app-updates.fixtures.json");
const KOTLIN_COPY = resolve(repo, "packages/mobile-kit/commonTest/update/AppUpdateFixture.kt");
const CONFIG = resolve(repo, "config/app-updates");

interface DecideCase {
  name: string;
  settings: AppUpdateSettings | null;
  platform: AppUpdatePlatform;
  build: number;
  noticeShownFor: number | null;
  storeAllows: boolean;
  expect: AppUpdateOutcome;
}
interface PublishCase { name: string; env: AppUpdateEnv; app: AppUpdateApp; file: unknown; ok: boolean }
interface PhoneCase { name: string; body: string; valid: boolean }

const raw = readFileSync(SOURCE, "utf8");
const fixtures = JSON.parse(raw) as { decide: DecideCase[]; publish: PublishCase[]; phone: PhoneCase[] };

describe("app updates - the decision (121 FR-001, FR-012, FR-015)", () => {
  it.each(fixtures.decide)("$name", (c) => {
    expect(
      decideAppUpdate({
        settings: c.settings,
        platform: c.platform,
        build: c.build,
        noticeShownFor: c.noticeShownFor,
        storeAllows: c.storeAllows,
      }),
    ).toEqual(c.expect);
  });
});

describe("app updates - what may be published (121 FR-017)", () => {
  it.each(fixtures.publish)("$name", (c) => {
    const result = validateAppUpdateSettings(c.file, { env: c.env, app: c.app });
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(c.ok);
  });

  it("every refusal names its reason", () => {
    for (const c of fixtures.publish.filter((x) => !x.ok)) {
      const result = validateAppUpdateSettings(c.file, { env: c.env, app: c.app });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length, c.name).toBeGreaterThan(0);
    }
  });
});

describe("app updates - the committed settings files", () => {
  it("there is one file per environment and app", () => {
    for (const env of APP_UPDATE_ENVS) {
      expect(readdirSync(resolve(CONFIG, env)).filter((f) => f.endsWith(".json")).sort()).toEqual(
        APP_UPDATE_APPS.map((a) => `${a}.json`).sort(),
      );
    }
  });

  it.each(APP_UPDATE_ENVS.flatMap((env) => APP_UPDATE_APPS.map((app) => ({ env, app }))))(
    "config/app-updates/$env/$app.json is publishable",
    ({ env, app }) => {
      const file = JSON.parse(readFileSync(resolve(CONFIG, env, `${app}.json`), "utf8")) as unknown;
      const result = validateAppUpdateSettings(file, { env, app });
      expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
    },
  );
});

describe("app updates - the Kotlin copy of the fixtures", () => {
  it("exists", () => {
    expect(existsSync(KOTLIN_COPY), KOTLIN_COPY).toBe(true);
  });

  it("is the fixtures file", () => {
    const kt = readFileSync(KOTLIN_COPY, "utf8");
    const embedded = /"""\n([\s\S]*?)\n"""/.exec(kt)?.[1];
    expect(embedded, "no triple-quoted copy found").toBeDefined();
    expect(JSON.parse(embedded!)).toEqual(JSON.parse(raw));
  });
});
