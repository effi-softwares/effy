import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Reads the real serverless.yml: a unit test that sets its own environment cannot catch a missing variable. */
const here = dirname(fileURLToPath(import.meta.url));
const yaml = readFileSync(resolve(here, "..", "serverless.yml"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(here, "..", "package.json"), "utf8")) as { dependencies: Record<string, string> };

const RUNTIME_PROVIDED = new Set(["AWS_REGION", "AWS_LAMBDA_FUNCTION_NAME"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

const declared = new Set([...yaml.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!));

describe("media worker deployment contract", () => {
  it("declares every environment variable its source reads", () => {
    const read = new Set<string>();
    for (const file of sourceFiles(here)) for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);
    expect([...read].filter((k) => !declared.has(k) && !RUNTIME_PROVIDED.has(k))).toEqual([]);
  });

  it("declares what the shared library reads on its behalf", () => {
    const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN", "METRIC_NAMESPACE", "EFFY_ENV", "LOG_LEVEL"];
    expect(required.filter((k) => !declared.has(k))).toEqual([]);
  });

  it("emits into the namespace the failure alarm watches", () => {
    expect(yaml).toMatch(/METRIC_NAMESPACE: Effy\/Media/);
    expect(readFileSync(resolve(here, "../../../../infra/envs/dev/media.tf"), "utf8")).toMatch(/namespace\s*=\s*"Effy\/Media"/);
  });

  it("has no HTTP route and attaches to no gateway", () => {
    expect(yaml).not.toMatch(/httpApi/);
  });

  it("render reads the rendition queue one picture at a time", () => {
    expect(yaml).toMatch(/sqs:\s*\n\s+arn: \$\{ssm:\/effy\/\$\{sls:stage\}\/media\/rendition_queue_arn\}\s*\n(\s*#.*\n)*\s+batchSize: 1/);
  });

  it("writes ONLY under renditions/, and reads only the two original prefixes", () => {
    const put = /Action: s3:PutObject\s*\n\s+Resource: (\S+)/.exec(yaml)?.[1];
    expect(put).toMatch(/\/renditions\/\*$/);
    const code = yaml.replace(/#.*$/gm, ""); // the prose may name what the permissions must not
    expect(code).not.toMatch(/(proof|courier-label)\//);
    expect(yaml).not.toMatch(/s3:DeleteObject/);
  });

  it("packages sharp for Lambda — external, installed for linux arm64, the same version as package.json", () => {
    expect(yaml).toMatch(/external:\s*\n\s+- sharp/);
    const pinned = pkg.dependencies.sharp;
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(yaml).toContain(`--os=linux --cpu=arm64 --libc=glibc sharp@${pinned}`);
    expect(yaml).toMatch(/^ {2}architecture: arm64$/m);
  });

  it("names the function the alarm watches", () => {
    expect(yaml).toMatch(/^service: effy-edge-media$/m);
    expect(yaml).toMatch(/^ {2}render:$/m);
    expect(readFileSync(resolve(here, "../../../../infra/envs/dev/media.tf"), "utf8")).toContain('"effy-edge-media-${var.env}-render"');
  });
});
