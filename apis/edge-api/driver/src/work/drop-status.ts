// The one mapping from `round_stop.status` to the driver's drop status, so every screen agrees.

export function dropStatusOf(s: string): "staged" | "out_for_delivery" | "en_route" | "arrived" | "delivered" | "failed" {
  switch (s) {
    case "out_for_delivery":
      return "out_for_delivery";
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "done":
      return "delivered";
    case "skipped":
      return "failed";
    default:
      return "staged";
  }
}
