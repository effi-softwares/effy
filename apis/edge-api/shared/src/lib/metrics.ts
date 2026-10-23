/**
 * Metrics as CloudWatch Embedded Metric Format on stdout: one log line per observation. Dimensions are
 * bounded values only (an outcome, a kind, a stage), never an id or typed text: each value is a
 * separate metric, billed and kept forever.
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
          // One dimension set with every key.
          Dimensions: [keys],
          Metrics: [{ Name: name, Unit: "Count" }],
        },
      ],
    },
    ...dimensions,
    [name]: value,
  };
  // Raw stdout, not the logger: EMF needs `_aws` at the top level.
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

/** `Effy/Storefront`, `Effy/Commerce`, …, declared once in the service's serverless.yml. */
export function metricNamespace(): string {
  return process.env.METRIC_NAMESPACE ?? "Effy/Edge";
}
