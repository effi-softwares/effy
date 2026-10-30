import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import { cn } from "@effy/design-system";
import { Badge } from "@effy/design-system/ui";

/**
 * A status that is not a package's (a window, a round, a driver): the same closed tones the nine
 * package words use - in progress → blue · done → green · waiting → outline · failed → black ·
 * inert → grey. Always a word; the tone only reinforces it. Package statuses go through
 * `PackageStatusPill`, never this.
 */
export type StatusTone = "moving" | "done" | "waiting" | "problem" | "muted" | "quiet" | "info";

const BADGE: Record<StatusTone, "default" | "success" | "warning" | "destructive" | "muted" | "quiet" | "info"> = {
  moving: "default",
  done: "success",
  waiting: "warning",
  problem: "destructive",
  muted: "muted",
  quiet: "quiet",
  info: "info",
};

export function StatusWord({
  tone,
  icon: Icon,
  children,
}: {
  tone: StatusTone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Badge variant={BADGE[tone]}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}

const DOT: Record<"on" | "busy" | "off" | "alert", string> = {
  on: "bg-success",
  busy: "bg-primary-fill",
  off: "bg-input",
  alert: "bg-foreground",
};

/** A driver's or a thing's state as a dot and a word ("On a round", "Idle", "Off duty"). */
export function DotWord({ tone, children }: { tone: "on" | "busy" | "off" | "alert"; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
      <span aria-hidden="true" className={cn("inline-block size-2 flex-none rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

/** Booked against a limit: a thin bar, booked in blue and held a lighter blue. */
export function Meter({
  booked,
  held = 0,
  label,
  limit,
}: {
  booked: number;
  held?: number;
  label: string;
  limit: string;
}) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{label}</span>
        <span>{limit}</span>
      </div>
      <div
        className="flex h-2 min-w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${label}, ${limit}`}
      >
        <i className="block h-full bg-primary-fill" style={{ width: pct(booked) }} />
        {held > 0 ? <i className="block h-full bg-primary-fill/40" style={{ width: pct(held) }} /> : null}
      </div>
    </div>
  );
}
