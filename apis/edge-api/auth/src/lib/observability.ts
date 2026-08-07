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
  | "otp_unknown_pool"
  // 038 — the CustomMessage interceptor. `rendered`: a branded message was produced. `fallback`:
  // ⚠ the fail-safe returned the event unmodified, so Cognito sent its OWN default template. A spike
  // in `fallback` means branding is silently broken — the message still arrives, so nothing else
  // signals it; this metric is the only signal, which is why it deserves an alarm.
  | "custom_message_rendered"
  | "custom_message_fallback";

export function emit(metric: OtpMetric, userPoolId: string, value = 1): void {
  // EMF: CloudWatch parses this shape out of the log stream into a real metric.
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "Effy/Auth",
          // ⚠ TWO DIMENSION SETS, AND THE EMPTY ONE IS NOT DECORATION.
          //
          // A dimension set defines a SEPARATE metric. Publishing only `[["userPoolId"]]` means the
          // metric `Effy/Auth otp_send_failed` — with no dimensions — DOES NOT EXIST, and an alarm
          // that names namespace + metric without dimensions watches exactly that: nothing. It sits
          // at OK reporting "no datapoints were received" forever.
          //
          // ⚠ THAT IS WHAT HAPPENED. All four of 035's alarms (otp-send-failures,
          // otp-verify-failures, otp-ratelimit-store-unavailable, otp-unknown-pool) are declared
          // without dimensions in infra/envs/dev/otp-store.tf. On 2026-08-06 the auth service
          // failed EVERY send for hours with AccessDeniedException — 7 recorded failures on the
          // customer pool alone — and `otp-send-failures` never left OK. The alarm whose own
          // description reads "a failed send IS a failed sign-in" could not fire, by construction.
          //
          // The empty set publishes the aggregate the alarms actually watch; the `userPoolId` set
          // is kept because it is what tells you WHICH audience is broken.
          Dimensions: [["userPoolId"], []],
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
