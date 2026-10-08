import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ⚠ THE ONE PLACE THAT KNOWS WHICH DEPLOYABLE STACKS EXIST (075).
 *
 * A stack is a `serverless*.yml`, not a directory. Until 075 the two were the same thing, and half
 * a dozen contract tests each found "the services" by reading `<dir>/serverless.yml`. Then
 * `inventory` became two stacks from one directory — one per gateway — and a guard that reads only
 * `serverless.yml` would have gone on passing while seeing half the service.
 *
 * So a guard that needs "every stack" asks here. A new stack file is then visible to all of them at
 * once, and a guard that lists directories for itself is the thing to fix.
 *
 * Test support only: nothing a Lambda runs imports this file.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** `apis/edge-api`. */
export const EDGE_API_DIR = resolve(here, "../../..");
/** `infra/envs/dev` — the Terraform root the stacks' parameters come from. */
export const INFRA_DEV_DIR = resolve(EDGE_API_DIR, "../../infra/envs/dev");

/** Which HTTP gateway a stack attaches its routes to. `null`: it has none (a worker). */
export type Gateway = "shared" | "staff";

export interface Stack {
  /** The directory under `apis/edge-api/`, e.g. `inventory`. */
  dir: string;
  /** The stack file inside it, e.g. `serverless.staff.yml`. */
  file: string;
  /** What `make edge-deploy SERVICE=` calls it: the service name without `effy-edge-`. */
  name: string;
  /** The `service:` line — the CloudFormation stack's name less the stage. */
  service: string;
  gateway: Gateway | null;
  /** The file's text, for a guard that needs more than this module extracts. */
  yml: string;
}

export interface StackFunction {
  key: string;
  handler: string;
  scheduled: boolean;
  /** The function's whole block, for a guard that needs more. */
  body: string;
  routes: StackRoute[];
}

export interface StackRoute {
  fn: string;
  method: string;
  path: string;
  /** The SSM parameter its authorizer is read from, e.g. `/staff/authorizer/back-office_id`; `null` when public. */
  authorizerParam: string | null;
}

const GATEWAY_PARAM: Record<string, Gateway> = {
  "/edge/http_api_id": "shared",
  "/staff/http_api_id": "staff",
};

function gatewayOf(file: string, yml: string): Gateway | null {
  const provider = yml.slice(yml.indexOf("\nprovider:"), yml.indexOf("\nfunctions:"));
  const m = /\n {2}httpApi:\n(?:\s*#.*\n)* {4}id: \$\{ssm:\/effy\/\$\{sls:stage\}(\/[a-z_/]+)\}/.exec(provider);
  if (!m) {
    if (/\n {2}httpApi:/.test(provider)) throw new Error(`${file}: provider.httpApi is set but its id is not an /effy/<stage>/… parameter`);
    return null;
  }
  const gateway = GATEWAY_PARAM[m[1]!];
  if (!gateway) throw new Error(`${file}: provider.httpApi.id reads ${m[1]}, which is neither gateway's parameter`);
  return gateway;
}

/** Every `serverless*.yml` under `apis/edge-api/<dir>/`. */
export function listStacks(): Stack[] {
  const out: Stack[] = [];
  for (const dir of readdirSync(EDGE_API_DIR).sort()) {
    let files: string[];
    try {
      files = readdirSync(resolve(EDGE_API_DIR, dir)).filter((f) => /^serverless(\.[a-z]+)?\.yml$/.test(f));
    } catch {
      continue; // a file, not a directory
    }
    for (const file of files.sort()) {
      const yml = readFileSync(resolve(EDGE_API_DIR, dir, file), "utf8");
      const service = /^service: (\S+)$/m.exec(yml)?.[1];
      if (!service) throw new Error(`${dir}/${file} names no service`);
      out.push({ dir, file, name: service.replace(/^effy-edge-/, ""), service, gateway: gatewayOf(`${dir}/${file}`, yml), yml });
    }
  }
  return out;
}

/** The functions a stack declares, each with the routes it serves. */
export function functionsOf(stack: Stack): StackFunction[] {
  const start = stack.yml.indexOf("\nfunctions:");
  if (start < 0) return [];
  const end = stack.yml.indexOf("\nresources:", start);
  const functions = stack.yml.slice(start, end < 0 ? undefined : end);
  const keys = [...functions.matchAll(/\n {2}([A-Za-z]\w*):\n/g)];
  const out: StackFunction[] = [];
  keys.forEach((m, i) => {
    const body = functions.slice(m.index, keys[i + 1]?.index);
    const handler = /\n\s+handler:\s*(\S+)/.exec(body)?.[1];
    if (!handler) return;
    const key = m[1]!;
    const routes: StackRoute[] = [];
    const events = [...body.matchAll(/\n\s+- httpApi:/g)];
    events.forEach((e, j) => {
      const block = body.slice(e.index, events[j + 1]?.index);
      const method = /\n\s+method:\s*['"]?([A-Za-z*]+)/.exec(block)?.[1];
      const path = /\n\s+path:\s*['"]?(\/\S*?)['"]?\s*(?:\n|$)/.exec(block)?.[1];
      if (!method || !path) throw new Error(`${stack.dir}/${stack.file}: ${key} has an httpApi event this reader cannot parse — write it as method: / path:`);
      const auth = /\n\s+id:\s*\$\{ssm:\/effy\/\$\{sls:stage\}(\/[a-z_/-]+)\}/.exec(block)?.[1] ?? null;
      if (auth === null && /\n\s+authorizer:/.test(block)) throw new Error(`${stack.dir}/${stack.file}: ${key} has an authorizer that is not an /effy/<stage>/… parameter`);
      routes.push({ fn: key, method: method.toUpperCase(), path, authorizerParam: auth });
    });
    out.push({ key, handler, scheduled: /-\s+schedule\b/.test(body), body, routes });
  });
  return out;
}

/** Every route a stack puts on its gateway. */
export function httpRoutes(stack: Stack): StackRoute[] {
  return functionsOf(stack).flatMap((f) => f.routes);
}
