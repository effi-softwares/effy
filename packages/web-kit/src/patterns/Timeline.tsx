import type { ComponentProps, ReactNode } from "react";

import { cn } from "@effy/design-system";

/**
 * A vertical log: a marker on a hairline, a title and a muted line under it. `tone` colours the
 * marker - `primary` for a step that moved the record on, `done` for a finish, `problem` for a fault.
 */
export function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol className={cn("flex flex-col", className)} {...props} />;
}

const MARK: Record<"default" | "primary" | "done" | "problem", string> = {
  default: "border bg-background",
  primary: "bg-primary-muted text-primary",
  done: "bg-success-soft text-success",
  problem: "bg-foreground text-background",
};

export function TimelineItem({
  icon,
  tone = "default",
  title,
  time,
  note,
  noteTone = "muted",
  children,
}: {
  icon: ReactNode;
  tone?: keyof typeof MARK;
  title: ReactNode;
  /** When it happened, on the right of the title. */
  time?: ReactNode;
  /** Words someone wrote, in a muted box under the line. */
  note?: ReactNode;
  /** `primary` marks a note only the team sees. */
  noteTone?: "muted" | "primary";
  children?: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-4 before:absolute before:top-5 before:bottom-0 before:left-[9.5px] before:w-px before:bg-border last:before:hidden">
      <span
        aria-hidden="true"
        className={cn("z-1 grid size-5 place-items-center rounded-full [&_svg]:size-3", MARK[tone])}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm leading-5 font-medium text-pretty">{title}</span>
          {time ? <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{time}</span> : null}
        </span>
        {children ? <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{children}</span> : null}
        {note ? (
          <span
            className={cn(
              "mt-2 block rounded-lg px-3 py-2 text-sm whitespace-pre-line text-foreground text-pretty",
              noteTone === "primary" ? "bg-primary-muted" : "bg-muted",
            )}
          >
            {note}
          </span>
        ) : null}
      </span>
    </li>
  );
}
