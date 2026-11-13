// make app-updates-check                    → tsx src/publish-app-updates.ts check
// make app-updates ENV=<env> [APP=<app>]    → tsx src/publish-app-updates.ts publish --env <env> [--app <app>]
//
// 121: the apps' update settings. Run by the operator from a workstation, on their own AWS credentials (AWS_PROFILE).
// Uses the AWS and git command lines rather than SDKs: four calls, no new dependency. Guide: config/app-updates/README.md.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { APP_UPDATE_APPS } from "@effy/shared-types";

import { checkAll, isApp, isEnv, publish, type AppUpdatePorts } from "./app-updates";
import { parseFlags, runTool } from "./db";

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

async function out(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await run(cmd, args, { cwd: repoRoot, env: process.env, maxBuffer: 1 << 20 });
  return stdout.trim();
}

const ports: AppUpdatePorts = {
  readFile: (path) => {
    const full = join(repoRoot, path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  },
  isUncommitted: async (path) => {
    const tracked = await out("git", ["ls-files", "--", path]);
    if (tracked === "") return true;
    return (await out("git", ["status", "--porcelain", "--", path])) !== "";
  },
  headCommit: () => out("git", ["rev-parse", "HEAD"]),
  ssmParameter: (name) => out("aws", ["ssm", "get-parameter", "--name", name, "--query", "Parameter.Value", "--output", "text"]),
  putObject: async ({ bucket, key, body, contentType, cacheControl, commit }) => {
    const dir = await mkdtemp(join(tmpdir(), "app-updates-"));
    const file = join(dir, "body.json");
    try {
      await writeFile(file, body);
      await out("aws", [
        "s3api", "put-object",
        "--bucket", bucket,
        "--key", key,
        "--body", file,
        "--content-type", contentType,
        "--cache-control", cacheControl,
        "--metadata", `commit=${commit}`,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  invalidate: async (distributionId, paths) => {
    await out("aws", ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", ...paths]);
  },
  log: (line) => console.log(line),
};

runTool("app-updates", async () => {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "check") {
    const problems = checkAll(ports);
    if (problems.length) throw new Error(`invalid settings:\n  ${problems.join("\n  ")}`);
    console.log("app-updates: OK - every config/app-updates/<env>/<app>.json may be published");
    return;
  }
  if (command !== "publish") throw new Error("usage: publish-app-updates.ts check | publish --env <dev|prod> [--app <customer|driver>]");

  const flags = parseFlags(rest, { env: "string", app: "string" });
  const env = String(flags.env ?? "");
  if (!isEnv(env)) throw new Error(`--env must be dev or prod (got "${env}")`);
  const app = flags.app === undefined ? undefined : String(flags.app);
  if (app !== undefined && !isApp(app)) throw new Error(`--app must be customer or driver (got "${app}")`);
  await publish(ports, env, app ? [app] : APP_UPDATE_APPS);
});
