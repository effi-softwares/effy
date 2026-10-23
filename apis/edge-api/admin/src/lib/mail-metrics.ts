/**
 * EMF metrics for delivery outcomes. `env` is the only dimension (`eventType` rides as a property),
 * and no address is ever passed to `emit`. `mail_hard_bounce` alarms at >= 1 in five minutes: one
 * lockout never moves a rate.
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

/** Twelve hex characters: enough to correlate log lines about one person, too few to enumerate anyone. */
export function addressFingerprint(address: string): string {
  return createHash("sha256").update(address.toLowerCase()).digest("hex").slice(0, 12)
}
