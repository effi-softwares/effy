import { useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { useLiveStatus } from "../live/LiveProvider";

/**
 * 071 FR-015 — says so when the screen cannot receive live updates.
 *
 * Nothing at all while the channel is live: the normal state has no indicator, because an
 * always-on "Live" badge is one more thing that can be green while the screen is wrong. When the
 * channel is not live it states that, states how old what is on screen is, and offers a refresh —
 * stale information is never presented as current.
 *
 * ⚠ It waits a few seconds before appearing. Every page load and every brief network blip passes
 * through "reconnecting"; flashing a warning for each would teach people to ignore it.
 */
const APPEAR_AFTER_MS = 4_000;

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function LiveStatus() {
  const live = useLiveStatus();
  const state = live?.state ?? "live";
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (state === "live") {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (!live || state === "live" || !shown) return null;

  const reconnecting = state === "reconnecting";
  return (
    <div
      role="status"
      className={
        reconnecting
          ? "bg-warning-soft text-warning flex items-center gap-2 rounded-full py-0.5 pr-1 pl-3 text-xs"
          : "bg-muted text-muted-foreground flex items-center gap-2 rounded-full py-0.5 pr-1 pl-3 text-xs"
      }
    >
      <span className="whitespace-nowrap">
        {reconnecting ? "Reconnecting" : "Live updates off"} · last updated {timeOfDay.format(live.currentAsOf)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Refresh now"
        onClick={live.refresh}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
