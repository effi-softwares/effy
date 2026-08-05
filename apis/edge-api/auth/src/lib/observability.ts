/**
 * Metrics for the sign-in path (Principle VII, research R15).
 *
 * Emitted as CloudWatch EMF on stdout — no SDK call, no added latency inside the 5-second wall.
 *
 * ⚠ TWO RULES, BOTH LOAD-BEARING:
 *
 * 1. **`userPoolId` is the ONLY dimension.** Never the email, never the `sub`, never the client id.
 *    A metric label is as much a permanent record as a log line, and a high-cardinality dimension
 *    is both a PII leak and a bill.
 *
 * 2. **Never pass a code, a digest, or an address into `emit`.** FR-014 covers telemetry, not just
 *    logs — SC-008 searches every log, trace AND metric store for a readable code.
 *
 * The alarm on `otp_ratelimit_store_unavailable` matters more than it looks: the issuance store
 * fails OPEN by design, so without that alarm a silent DynamoDB outage would silently disable the
 * per-address rate limit and nothing would ever say so.
 */

export type OtpMetric =
  | "otp_code_issued"
  | "otp_send_failed"
  | "otp_verify_failed"
  | "otp_attempts_exhausted"
  | "otp_rate_limited"
  | "otp_ratelimit_store_unavailable"
  | "otp_email_verify_failed"
  | "otp_unknown_pool";

export function emit(metric: OtpMetric, userPoolId: string, value = 1): void {
  // EMF: CloudWatch parses this shape out of the log stream into a real metric.
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "Effy/Auth",
          Dimensions: [["userPoolId"]],
          Metrics: [{ Name: metric, Unit: "Count" }],
        },
      ],
    },
    userPoolId,
    [metric]: value,
  };
  // eslint-disable-next-line no-console -- EMF is delivered via stdout by design.
  console.log(JSON.stringify(payload));
}
