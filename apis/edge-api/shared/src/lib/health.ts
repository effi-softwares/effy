// The platform's two probes, for EVERY cold-path service (constitution Principle II — this is
// cross-cutting, so it lives here once rather than being copy-pasted into each service).
//
// WHY TWO, NOT ONE. They answer different questions, and conflating them makes both useless:
//
//   healthz (liveness)  — "is THIS SERVICE deployed and executing?"
//                          Touches NOTHING. No database, no network, no secrets. It can only fail
//                          if the route is wrong, the deploy is broken, or the runtime is dead.
//
//   readyz  (readiness) — "can this service actually SERVE TRAFFIC right now?"
//                          Probes its dependencies (the database) under a strict time budget.
//                          A 503 here means "alive but not usable" — a genuinely different fault.
//
// The distinction is what makes them diagnostic. A single combined probe that hits the DB cannot
// distinguish "the service is not deployed" from "the database is down" — both just look red, and
// you learn nothing about which. Split, the pair localizes the fault immediately:
//
//   healthz 200 + readyz 200  → healthy
//   healthz 200 + readyz 503  → the service is fine; its DATABASE is not
//   healthz ✗                 → the service itself is not there (bad deploy / wrong route / dead)
//
// Both are PUBLIC and unversioned — no authorizer. A probe that needs a credential is a probe you
// cannot use when things are broken, which is the only time you need it. Neither body ever names a
// host, a credential, or a driver error: they carry a status and a service name, nothing more.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { pingDatabase } from "./db";
import { json, preamble } from "./http";

// Dependency probes get a hard ceiling. Without one, a hung database turns a readiness check into
// a Lambda timeout — the probe becomes the outage instead of reporting it.
const PROBE_BUDGET_MS = 2_000;

type EdgeHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<APIGatewayProxyStructuredResultV2>;

/**
 * GET /<service>/healthz — LIVENESS. Public, unversioned, dependency-free.
 *
 * Reaching this handler at all IS the assertion: the deploy exists, the route is mapped, and the
 * runtime executes. It deliberately does no work, so it cannot fail for someone else's reasons.
 * The `service` field is what lets you tell WHICH service answered when several sit behind one
 * shared gateway.
 */
export function livenessHandler(service: string): EdgeHandler {
  return async (event, context) => {
    const scope = preamble(event, context);
    return json(200, { status: "ok", service }, scope);
  };
}

/**
 * GET /<service>/readyz — READINESS. Public, unversioned, probes the database.
 *
 * 200 → dependencies reachable, safe to serve.
 * 503 → alive but NOT usable. The caller should back off, not retry hard.
 *
 * A cold start makes the first call slower — a documented tolerance, not a fault.
 */
export function readinessHandler(service: string): EdgeHandler {
  return async (event, context) => {
    const scope = preamble(event, context);

    try {
      await Promise.race([
        pingDatabase(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("readyz: database probe timed out")),
            PROBE_BUDGET_MS,
          ),
        ),
      ]);
    } catch (err) {
      // Logged with the error; RETURNED without it. The log is for us, the body is for the public.
      scope.log.warn({ err }, "readiness: database unreachable");
      return json(
        503,
        { status: "unavailable", service, checks: { database: "unreachable" } },
        scope,
      );
    }

    scope.log.debug("readiness ok");
    return json(200, { status: "ready", service, checks: { database: "ok" } }, scope);
  };
}
