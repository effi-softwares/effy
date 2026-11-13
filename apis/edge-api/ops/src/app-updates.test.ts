import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkAll, publish, settingsPath, type AppUpdatePorts } from "./app-updates";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const VALID = JSON.stringify({
  schema: 1,
  ios: { minimum: 0, recommended: 0, latest: 4, storeUrl: "https://apps.apple.com/au/app/id6740012345" },
  android: { minimum: 0, recommended: 0, latest: 4, storeUrl: "https://play.google.com/store/apps/details?id=com.effyshopping.customer.mobile" },
});

function fakePorts(files: Record<string, string>, opts: { uncommitted?: string[] } = {}) {
  const calls: string[] = [];
  const puts: Parameters<AppUpdatePorts["putObject"]>[0][] = [];
  const ports: AppUpdatePorts = {
    readFile: (p) => files[p] ?? null,
    isUncommitted: async (p) => (opts.uncommitted ?? []).includes(p),
    headCommit: async () => "abc123def4567890",
    ssmParameter: async (name) => {
      calls.push(`ssm ${name}`);
      if (name.endsWith("/media/bucket")) return "effy-dev-product-media";
      if (name.endsWith("/app_updates/distribution_id")) return "E123";
      return "https://media.dev.effyshopping.com";
    },
    putObject: async (input) => {
      calls.push(`put ${input.key}`);
      puts.push(input);
    },
    invalidate: async (id, paths) => {
      calls.push(`invalidate ${id} ${paths.join(",")}`);
    },
    log: () => {},
  };
  return { ports, calls, puts };
}

describe("make app-updates (121 FR-016..FR-019)", () => {
  it("publishes a valid, committed file: upload with its headers and commit, then one invalidation", async () => {
    const { ports, calls, puts } = fakePorts({ [settingsPath("prod", "customer")]: VALID });
    await publish(ports, "prod", ["customer"]);
    expect(calls.filter((c) => !c.startsWith("ssm"))).toEqual(["put app-updates/customer.json", "invalidate E123 /app-updates/*"]);
    expect(puts[0]).toMatchObject({
      bucket: "effy-dev-product-media",
      contentType: "application/json",
      cacheControl: "public, max-age=60",
      commit: "abc123def4567890",
      body: VALID,
    });
  });

  it("refuses an invalid file and sends nothing", async () => {
    const bad = VALID.replace('"latest":4', '"latest":-1');
    const { ports, calls } = fakePorts({ [settingsPath("prod", "customer")]: bad });
    await expect(publish(ports, "prod", ["customer"])).rejects.toThrow(/nothing published[\s\S]*latest/);
    expect(calls).toEqual([]);
  });

  it("refuses a file with uncommitted changes and sends nothing", async () => {
    const path = settingsPath("dev", "driver");
    const driver = VALID.replace("com.effyshopping.customer.mobile", "com.effyshopping.driver.mobile");
    const { ports, calls } = fakePorts({ [path]: driver }, { uncommitted: [path] });
    await expect(publish(ports, "dev", ["driver"])).rejects.toThrow(/uncommitted/);
    expect(calls).toEqual([]);
  });

  it("refuses all apps when one is invalid - never half a publish", async () => {
    const { ports, calls } = fakePorts({ [settingsPath("dev", "customer")]: VALID, [settingsPath("dev", "driver")]: "not json" });
    await expect(publish(ports, "dev", ["customer", "driver"])).rejects.toThrow(/driver\.json: not JSON/);
    expect(calls).toEqual([]);
  });

  it("refuses a missing file", async () => {
    const { ports } = fakePorts({});
    await expect(publish(ports, "dev", ["customer"])).rejects.toThrow(/missing/);
  });

  it("check passes over the committed files", () => {
    const real: AppUpdatePorts = {
      ...fakePorts({}).ports,
      readFile: (p) => readFileSync(join(repoRoot, p), "utf8"),
    };
    expect(checkAll(real)).toEqual([]);
  });
});
