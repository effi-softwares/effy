// Telemetry for the order console (053, constitution Principle VII).
//
// EMF on stdout — the same pattern the 035 auth triggers and the 050 notifications worker use. No
// SDK call, no metric-filter/log-group ordering dependency: CloudWatch extracts these into the
// `Effy/Orders` namespace on its own.
//
// ⚠ LOW-CARDINALITY DIMENSIONS ONLY, AND NO PII. Never an order id, never a customer, never a staff
// subject — those belong in the structured log and the audit trail, not in a metric dimension.

/** Emit one EMF record. Dimensions must be a closed, small set of values. */
function emit(
  metrics: { name: string; value: number }[],
  dimensions: Record<string, string> = {},
): void {
  const keys = Object.keys(dimensions);
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Orders",
            Dimensions: keys.length ? [keys] : [[]],
            Metrics: metrics.map((m) => ({ Name: m.name, Unit: "Count" })),
          },
        ],
      },
      ...dimensions,
      ...Object.fromEntries(metrics.map((m) => [m.name, m.value])),
    }),
  );
}

/**
 * A handover was recorded.
 *
 * ⚠ `hasReference` is the dimension because it is the operational question worth watching: FR-003
 * says a handover with no carrier reference is an ordinary, complete state, and this is what proves
 * that case is real traffic rather than a theoretical allowance nobody exercises.
 */
export function carrierHandoffRecorded(hasReference: boolean): void {
  emit([{ name: "CarrierHandoffRecorded", value: 1 }], {
    hasReference: hasReference ? "yes" : "no",
  });
}

/**
 * An arrival was recorded, and whether it completed the order.
 *
 * ⚠ `OrderCompleted` IS THE NUMBER THIS WHOLE FEATURE EXISTS TO MOVE OFF ZERO. Before 053 a standard
 * order could never reach a finished state, so this metric would have been flat zero forever. It is
 * also the only signal that will say whether operators are ACTUALLY recording these by hand — the
 * plan records that risk explicitly, and this is how it becomes visible rather than assumed.
 */
export function arrivalRecorded(source: "staff_recorded", orderFinished: boolean): void {
  emit(
    [
      { name: "OrderArrivalRecorded", value: 1 },
      { name: "OrderCompleted", value: orderFinished ? 1 : 0 },
    ],
    { source },
  );
}
