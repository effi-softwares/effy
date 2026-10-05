import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LIVE_KINDS } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { LIVE_NAMESPACES } from "./channel";

/**
 * 071 — the live channel is held together by names written in three languages: the code that
 * publishes (TypeScript), the service configuration that permits it (YAML), and the infrastructure
 * that creates the channel and watches it (Terraform). A mismatch between any two fails silently:
 * a publish is refused and swallowed, a route answers "no channel", an alarm watches a series
 * nothing emits. This holds them to each other.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");
const liveTf = readFileSync(resolve(edgeApi, "../../infra/envs/dev/live.tf"), "utf8");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(readFileSync(path, "utf8"));
  }
  return out;
}

/** Deployed services (those with a serverless.yml), with their config and their source. */
const services = readdirSync(edgeApi)
  .filter((dir) => {
    try {
      return statSync(resolve(edgeApi, dir, "serverless.yml")).isFile();
    } catch {
      return false;
    }
  })
  .map((dir) => ({
    dir,
    yml: readFileSync(resolve(edgeApi, dir, "serverless.yml"), "utf8"),
    src: sources(resolve(edgeApi, dir, "src")).join("\n"),
  }));

/**
 * A service announces if its own source calls `announce(…)`, or one of the shared library's
 * announcing helpers (`announcePaid` — the publish then runs inside this service, under its role).
 */
const announces = (s: { src: string }) => /\bannounce(?:Paid)?\(/.test(s.src);
const describes = (s: { src: string }) => /\bliveRoute\(/.test(s.src);

describe("071 — services and the channel's configuration", () => {
  it("at least one service announces and one describes (the test is looking at something)", () => {
    expect(services.filter(announces).map((s) => s.dir)).toContain("commerce");
    expect(services.filter(describes).map((s) => s.dir)).toContain("shop");
  });

  it.each(services.filter(announces).map((s) => [s.dir, s] as const))(
    "%s announces, so it may publish and knows where",
    (_dir, s) => {
      expect(s.yml).toMatch(/LIVE_HTTP_HOST: \$\{ssm:\/effy\/\$\{sls:stage\}\/live\/http_host\}/);
      expect(s.yml).toMatch(/Action: appsync:EventPublish\n\s+Resource: \$\{ssm:\/effy\/\$\{sls:stage\}\/live\/api_arn\}\/channelNamespace\/\*/);
    },
  );

  it.each(services.filter(describes).map((s) => [s.dir, s] as const))(
    "%s describes the channel, so it knows both hosts",
    (_dir, s) => {
      expect(s.yml).toMatch(/LIVE_HTTP_HOST: \$\{ssm:\/effy\/\$\{sls:stage\}\/live\/http_host\}/);
      expect(s.yml).toMatch(/LIVE_REALTIME_HOST: \$\{ssm:\/effy\/\$\{sls:stage\}\/live\/realtime_host\}/);
    },
  );

  it("no service is permitted to publish that does not announce", () => {
    const permitted = services.filter((s) => s.yml.includes("appsync:EventPublish")).map((s) => s.dir);
    expect(permitted.sort()).toEqual(services.filter(announces).map((s) => s.dir).sort());
  });
});

describe("071 — the channel's infrastructure", () => {
  const list = (name: string) =>
    [...(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(liveTf)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  it("creates exactly the namespaces the code publishes to", () => {
    expect(list("live_namespaces")).toEqual([...LIVE_NAMESPACES]);
  });

  it("watches send failures for every kind the code can publish", () => {
    expect(list("live_kinds")).toEqual([...LIVE_KINDS]);
  });

  it("publishes the three parameters the services read", () => {
    for (const name of ["http_host", "realtime_host", "api_arn"]) {
      expect(liveTf).toContain(`"/effy/\${var.env}/live/${name}"`);
    }
  });

  it("names the authorizer by the name its service deploys it under", () => {
    const yml = readFileSync(resolve(edgeApi, "live/serverless.yml"), "utf8");
    expect(/^service: (\S+)$/m.exec(yml)?.[1]).toBe("effy-edge-live");
    expect(yml).toMatch(/\nfunctions:\n {2}authorizer:\n/);
    expect(liveTf).toContain('live_authorizer_function = "effy-edge-live-${var.env}-authorizer"');
  });

  it("every alarm reaches someone", () => {
    const alarms = liveTf.split('resource "aws_cloudwatch_metric_alarm"').slice(1);
    expect(alarms.length).toBeGreaterThanOrEqual(2);
    for (const alarm of alarms) expect(alarm).toContain("alarm_actions");
  });

  it("clients can never publish: publishing is by role only", () => {
    expect(liveTf).toMatch(/default_publish_auth_mode \{\s*auth_type = "AWS_IAM"/);
    expect(liveTf).not.toContain("API_KEY");
    expect(liveTf).not.toContain("AMAZON_COGNITO_USER_POOLS");
  });
});
