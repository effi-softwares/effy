import { Bell } from "lucide-react";

import { Button } from "@effy/design-system/ui";

/**
 * The console header's alerts button: a 30px bordered icon button with an `--accent2` dot when
 * something is waiting (zero renders no dot). The dot carries no number; the accessible name states
 * the count ("Alerts, 4 needing attention").
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
