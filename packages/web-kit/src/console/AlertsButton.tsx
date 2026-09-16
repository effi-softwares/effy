import { Bell } from "lucide-react";

import { Button } from "@effy/design-system/ui";

/**
 * The console header's alerts button — a 30px square bordered icon button carrying an `--accent2`
 * dot when something is waiting (theme-adoption-prompt.md, Phase 3 §Console shell).
 *
 * ⚠ THE DOT IS THE PLATFORM'S ONE SANCTIONED USE OF THE ATTENTION HUE IN CHROME. Orange means time
 * pressure and nothing else; if it appears anywhere on a screen besides here and a cut-off chip, it
 * has stopped meaning anything.
 *
 * ⚠ THE COUNT IS ANNOUNCED, NOT DRAWN. The dot carries no number — a two-digit badge at 30px is
 * unreadable — so the accessible name states the count instead. A screen reader hears "Alerts, 4
 * needing attention"; a sighted operator sees that there is something, and opens it to learn what.
 *
 * ⚠ ZERO RENDERS NO DOT. An indicator that is always lit is not an indicator.
 */
export interface AlertsButtonProps {
  count: number;
  onOpen: () => void;
}

export function AlertsButton({ count, onOpen }: AlertsButtonProps) {
  const waiting = Number.isFinite(count) && count > 0;

  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="relative"
      onClick={onOpen}
      aria-label={waiting ? `Alerts, ${count} needing attention` : "Alerts, nothing waiting"}
      title="Alerts"
    >
      <Bell className="size-[15px]" />
      {waiting ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 size-1.5 rounded-full bg-accent2 ring-2 ring-background"
        />
      ) : null}
    </Button>
  );
}
