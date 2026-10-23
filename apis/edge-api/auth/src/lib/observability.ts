/**
 * EMF metrics on stdout (no latency inside Cognito's 5 s). `userPoolId` is the only dimension, and no
 * code, digest or address is ever passed to `emit`. `otp_ratelimit_store_unavailable` must alarm:
 * the issuance store fails open.
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
  // CustomMessage: `fallback` means Cognito sent its own default template; the only signal of broken branding.
  | "custom_message_rendered"
  | "custom_message_fallback";

export function emit(metric: OtpMetric, userPoolId: string, value = 1): void {
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "Effy/Auth",
          // Two dimension sets: the empty one publishes the aggregate the alarms watch (each set is a separate
          // metric), and `userPoolId` says which audience broke.
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
