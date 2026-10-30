// Where a driver's run is: one stage, worded the same in the driver app, dispatch day and round detail.
// Derived from the round's rows (`ROUND_STAGE_FACTS` in @effy/edge-shared), never stored.

export type RunStage =
  | "to_collect"
  | "collecting"
  | "to_hub"
  | "checked_in"
  | "to_load"
  | "out"
  | "returning"
  | "closed";

/** What a run's stage is worked out from - counts only. */
export interface RunStageFacts {
  kind: "collection" | "delivery";
  /** driver_round.status */
  status: string;
  /** Collection: shop stops, and those collected or declared not available. */
  shopsTotal: number;
  shopsSettled: number;
  /** Collection: the hub check-in has been made. */
  checkedIn: boolean;
  /** Delivery: drops, those not yet loaded, and those delivered or not delivered. */
  dropsTotal: number;
  dropsPending: number;
  dropsFinished: number;
  /** Delivery: parcels from failed drops still with the driver. */
  toReturn: number;
}

export const RUN_STAGE_WORDS: Record<RunStage, string> = {
  to_collect: "To collect",
  collecting: "Collecting",
  to_hub: "Heading to the hub",
  checked_in: "Checked in",
  to_load: "To load",
  out: "Out",
  returning: "Returning",
  closed: "Closed",
};

export function runStage(f: RunStageFacts): { stage: RunStage; label: string } {
  if (f.kind === "collection") {
    if (f.checkedIn || f.status === "completed" || f.status === "cancelled") return word("checked_in");
    if (f.shopsTotal > 0 && f.shopsSettled >= f.shopsTotal) return word("to_hub");
    if (f.shopsSettled === 0) return word("to_collect");
    return { stage: "collecting", label: `Collecting ${f.shopsSettled} of ${f.shopsTotal}` };
  }
  if (f.status === "completed" || f.status === "cancelled") return word("closed");
  if (f.dropsPending > 0) return word("to_load");
  if (f.dropsFinished < f.dropsTotal) return { stage: "out", label: `Out ${f.dropsFinished} of ${f.dropsTotal}` };
  if (f.toReturn > 0) return { stage: "returning", label: `Returning ${f.toReturn}` };
  return word("closed");
}

function word(stage: RunStage): { stage: RunStage; label: string } {
  return { stage, label: RUN_STAGE_WORDS[stage] };
}
