/**
 * One way to emit an operational metric: CloudWatch Embedded Metric Format on stdout.
 *
 * A Lambda cannot keep a counter in memory — the process is frozen between invocations and thrown
 * away without notice — so each observation is written as one structured log line that CloudWatch
 * turns into a metric. No agent, no network call, nothing to flush.
 *
 * ⚠ DIMENSIONS ARE BOUNDED VALUES ONLY (constitution Principle VII): an outcome, a kind, a stage.
 * Never a customer id, an order id, a list name or any text a person typed — every distinct
 * dimension value is a separate metric, billed separately and kept forever.
 */

export type MetricDimensions = Readonly<Record<string, string>>;

export function emitMetric(
  namespace: string,
  name: string,
  value = 1,
  dimensions: MetricDimensions = {},
): void {
  const keys = Object.keys(dimensions);
  const record = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          // One dimension SET holding every key: the metric is addressed by the full combination.
          Dimensions: [keys],
          Metrics: [{ Name: name, Unit: "Count" }],
        },
      ],
    },
    ...dimensions,
    [name]: value,
  };
  // Raw stdout, not the logger: EMF requires the `_aws` object at the top level of the line, and
  // the logger's base fields would be read as (unbounded) dimensions of nothing.
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

/**
 * The service's metric namespace (`Effy/Storefront`, `Effy/Commerce`, …), declared once in its
 * `serverless.yml` so shared code can emit without each caller naming it.
 */
export function metricNamespace(): string {
  return process.env.METRIC_NAMESPACE ?? "Effy/Edge";
}
