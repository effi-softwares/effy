// Emits the oldest review item's age, because an unwatched queue fails silently: shops just cannot
// sell. An empty queue emits 0, so "no data" means the function is not running.
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
