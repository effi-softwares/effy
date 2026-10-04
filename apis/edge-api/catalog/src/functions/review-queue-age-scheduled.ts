// Scheduled — how long has the oldest review item waited? (067)
//
// ⚠ THE ONE BLIND SPOT THIS FEATURE INTRODUCES. Before 067 a shop published and sold. Now a product
// sits in a queue until a person at Effy looks, and if nobody looks NOTHING FAILS: no error, no
// alarm, no red test — a shop simply cannot sell, and learns to stop adding products. This emits the
// age of the oldest waiting item as a metric an alarm can watch.
//
// EMF (embedded metric format): the log line IS the metric — no PutMetricData call, no extra IAM.
// An EMPTY queue emits 0, so "no data" always means the function is not running.
import { oldestWaitingHours } from "../review/service";

export const handler = async (): Promise<void> => {
  const hours = (await oldestWaitingHours()) ?? 0;
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Catalog",
            Dimensions: [[]],
            Metrics: [{ Name: "ProductReviewOldestWaitingHours", Unit: "Count" }],
          },
        ],
      },
      ProductReviewOldestWaitingHours: hours,
    }),
  );
};
