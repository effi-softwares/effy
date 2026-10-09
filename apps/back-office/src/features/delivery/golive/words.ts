import type { GoLiveHistoryEntry, GoLiveItemKey } from "@effy/shared-types";

/** What each line of the checklist is called. The detail beside it is the service's own sentence. */
export const ITEM_LABEL: Record<GoLiveItemKey, string> = {
  coverage: "Delivery area",
  hub: "Hub",
  effy_plan: "Delivery fee plan",
  windows: "Delivery windows",
  collection_runs: "Collection runs",
  courier: "Courier delivery",
  drivers: "Drivers",
  out_of_area: "Addresses outside the area",
};

export const HISTORY_VERB: Record<GoLiveHistoryEntry["action"], string> = {
  set: "Set",
  changed: "Changed",
  cancelled: "Cancelled",
  turned_off: "Turned back off",
  blocked: "Stopped — the platform was not ready",
};

const MELBOURNE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne", weekday: "short", day: "numeric", month: "short", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
});

/** An instant as the business reads it: "Sat, 10 Oct 2026, 6:00 am (Melbourne)". */
export function melbourneMoment(iso: string): string {
  return `${MELBOURNE.format(new Date(iso))} (Melbourne)`;
}

/** Where a checklist line is fixed: a tab of this screen, or another page. */
export function fixTarget(fixAt: string): { tab: string } | { href: string } {
  const m = /^\/delivery\?tab=([a-z-]+)$/.exec(fixAt);
  return m ? { tab: m[1]! } : { href: fixAt };
}
