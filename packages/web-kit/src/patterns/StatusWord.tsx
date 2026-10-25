import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import { cn } from "@effy/design-system";

/**
 * A status that is not a package's (a window, a round, a driver): the same closed tones the nine
 * package words use — in progress → blue · done → green · waiting → outline · failed → black ·
 * inert → grey. Always a word; the tone only reinforces it. Package statuses go through
 * `PackageStatusPill`, never this.
 */
export type StatusTone = "moving" | "done" | "waiting" | "problem" | "muted" | "quiet" | "info";

export function StatusWord({ tone, icon: Icon, children }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn("ef-st", `ef-st--${tone}`)}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** A driver's or a thing's state as a dot and a word ("On a round", "Idle", "Off duty"). */
export function DotWord({ tone, children }: { tone: "on" | "busy" | "off" | "alert"; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
      <span aria-hidden="true" className={cn("ef-dot", `ef-dot--${tone}`)} />
      {children}
    </span>
  );
}

/** Booked against a limit: a thin bar, booked in blue and held a lighter blue. */
export function Meter({ booked, held = 0, label, limit }: { booked: number; held?: number; label: string; limit: string }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  return (
    <div>
      <div className="ef-progress-label">
        <span>{label}</span>
        <span>{limit}</span>
      </div>
      <div className="ef-meter" role="img" aria-label={`${label}, ${limit}`}>
        <i className="ef-meter__booked" style={{ width: pct(booked) }} />
        {held > 0 ? <i className="ef-meter__held" style={{ width: pct(held) }} /> : null}
      </div>
    </div>
  );
}
