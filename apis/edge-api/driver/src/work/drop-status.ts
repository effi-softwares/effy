// The one mapping from a stored `round_stop.status` to the driver contract's drop status (2026-09-30).
//
// ⚠ ONE FUNCTION BECAUSE TWO READS DISAGREED. The drop screen mapped `arrived → "arrived"` and
// everything else to "staged"; the run list mapped `arrived → "en_route"` and everything else to
// "staged". The same drop could read differently on two screens of one app — and neither knew about
// the in-transit states, which is half of why "Start this drop" appeared to do nothing.

/** The stored stop state as the driver contract names it. One mapping, used by every drop read. */
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
