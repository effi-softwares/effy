import type { ReactNode } from "react";

import { cn } from "@effy/design-system";

/**
 * A vertical log: a marker on a hairline, a title and a muted line under it. `tone` colours the
 * marker — `primary` for a step that moved the record on, `done` for a finish, `problem` for a fault.
 */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn("flex flex-col", className)}>{children}</ol>;
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
  children,
}: {
  icon: ReactNode;
  tone?: keyof typeof MARK;
  title: ReactNode;
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
        <span className="block text-sm leading-5 font-medium text-pretty">{title}</span>
        {children ? <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{children}</span> : null}
      </span>
    </li>
  );
}
