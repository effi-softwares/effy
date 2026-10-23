// EMF on stdout into `Effy/Orders`. Low-cardinality dimensions only, never an id or a person.

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

/** `hasReference` shows that handovers without a carrier reference are real traffic. */
export function carrierHandoffRecorded(hasReference: boolean): void {
  emit([{ name: "CarrierHandoffRecorded", value: 1 }], {
    hasReference: hasReference ? "yes" : "no",
  });
}

/** `OrderCompleted` shows whether operators actually record arrivals. */
export function arrivalRecorded(source: "staff_recorded", orderFinished: boolean): void {
  emit(
    [
      { name: "OrderArrivalRecorded", value: 1 },
      { name: "OrderCompleted", value: orderFinished ? 1 : 0 },
    ],
    { source },
  );
}
