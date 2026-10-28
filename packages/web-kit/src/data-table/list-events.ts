// 103: the two list events, in the apps' typed taxonomy. web-kit cannot import an app's telemetry, so each
// app hands its `track` here once, at start-up. Never search text, never an id.
export type ListEvent =
  | { name: "list_viewed"; list: string; mode: "offset" | "keyset" }
  | { name: "list_filtered"; list: string };

let sink: ((event: ListEvent) => void) | null = null;

/** Called once by each app beside its telemetry init. */
export function setListEventSink(track: (event: ListEvent) => void): void {
  sink = track;
}

export function emitListEvent(event: ListEvent): void {
  sink?.(event);
}
