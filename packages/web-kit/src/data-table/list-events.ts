// 103: the list events, in the apps' typed taxonomy. web-kit cannot import an app's telemetry, so each
// app hands its `track` here once, at start-up. Never search text, never an id. 104 adds the activity
// drawer's three (which log, and for an export how many rows - nothing about what was in it).
export type ListEvent =
  | { name: "list_viewed"; list: string; mode: "offset" | "keyset" }
  | { name: "list_filtered"; list: string }
  | { name: "activity_log_opened"; log: string }
  | { name: "activity_log_exported"; log: string; rows: number }
  | { name: "activity_log_export_refused"; log: string };

let sink: ((event: ListEvent) => void) | null = null;

/** Called once by each app beside its telemetry init. */
export function setListEventSink(track: (event: ListEvent) => void): void {
  sink = track;
}

export function emitListEvent(event: ListEvent): void {
  sink?.(event);
}
