/**
 * Metrics for the delivery-outcome path (037, Principle VII).
 *
 * Emitted as CloudWatch EMF on stdout — no SDK call, no added latency. Mirrors
 * `apis/edge-api/auth/src/lib/observability.ts`; the same discipline applies.
 *
 * ⚠ TWO RULES, BOTH LOAD-BEARING:
 *
 * 1. **`env` is the ONLY dimension.** Never the address, never its domain, never the message id. A
 *    metric label is as permanent as a log line, and a high-cardinality dimension is both a PII leak
 *    and a bill. `eventType` rides as a PROPERTY, which CloudWatch keeps searchable without making
 *    it a dimension.
 *
 * 2. **Never pass an address into `emit`.** Use `addressFingerprint` when two log lines need to be
 *    correlated to the same person.
 *
 * ⚠ `mail_hard_bounce` is alarmed at >= 1 in five minutes, not on a rate. That is the whole point:
 * one person being permanently locked out never moves a percentage, which is exactly why the
 * pre-existing bounce-RATE alarm could not catch it.
 */

import { createHash } from "node:crypto"

export type MailMetric =
  | "mail_event_received"
  | "mail_hard_bounce"
  | "mail_complaint"
  | "mail_repair_performed"
  | "mail_from_domain_healthy"

export function emit(
  metric: MailMetric,
  properties: Record<string, string | number> = {},
  value = 1,
): void {
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "Effy/Mail",
          Dimensions: [["env"]],
          Metrics: [{ Name: metric, Unit: "Count" }],
        },
      ],
    },
    env: process.env.EFFY_ENV ?? "unknown",
    ...properties,
    [metric]: value,
  }
  // eslint-disable-next-line no-console -- EMF is delivered via stdout by design.
  console.log(JSON.stringify(payload))
}

/**
 * A short, stable, one-way fingerprint of an address — safe to log.
 *
 * ⚠ Exists so the log discipline is CHEAP TO FOLLOW. The alternative to a helper is each call site
 * deciding for itself, and the failure mode of that is one line somewhere that logs the address.
 * Twelve hex characters is enough to correlate lines about one person and far too little to
 * enumerate anyone.
 */
export function addressFingerprint(address: string): string {
  return createHash("sha256").update(address.toLowerCase()).digest("hex").slice(0, 12)
}
