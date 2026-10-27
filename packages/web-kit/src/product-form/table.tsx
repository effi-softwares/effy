import type { ReactNode } from "react";

import { cn } from "@effy/design-system";

/** The form's small table pieces, on the console's `ef-table` patterns (shared by both consoles). */
export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-sm font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ef-table-wrap", className)}>
      <div className="ef-table-scroll">
        <table className="ef-table">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className={cn(align === "right" && "is-num")}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={cn(align === "right" && "is-num", className)}>{children}</td>
  );
}
