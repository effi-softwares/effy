import type { ReactNode } from "react";

import { CircleAlert } from "lucide-react";

import { cn } from "@effy/design-system";
import { Badge } from "@effy/design-system/ui";

export interface DetailGroupRow {
  key: string;
  label: string;
  /** The value as written; empty means none. */
  value: ReactNode;
  required?: boolean;
  /** It holds a value per size. */
  perSize?: boolean;
  /** Required and empty. */
  missing?: boolean;
}

export interface DetailGroup {
  title: string;
  rows: readonly DetailGroupRow[];
  /** The group's own Edit. */
  action?: ReactNode;
}

/**
 * The details a product's category asks for, a group per category section: label above value, two columns, a
 * required one that is empty said in red where it would be.
 */
export function DetailGroups({ groups, onAdd }: { groups: readonly DetailGroup[]; onAdd?: (row: DetailGroupRow) => ReactNode }) {
  return (
    <div className="grid gap-11">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <div className="mb-2 flex min-h-9 items-center gap-2">
            <h3 className="text-[13px] font-semibold">{g.title}</h3>
            {g.action ? <div className="ml-auto">{g.action}</div> : null}
          </div>
          <dl className="m-0 grid gap-x-12 md:grid-cols-2">
            {g.rows.map((r) => (
              <div key={r.key} className="min-w-0 border-t py-4">
                <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  {r.label}
                  {r.required ? <Badge variant="outline" className="h-[18px] px-1.5 text-[11px] text-muted-foreground">Required</Badge> : null}
                  {r.perSize ? <Badge variant="outline" className="h-[18px] px-1.5 text-[11px] text-muted-foreground">Per size</Badge> : null}
                </dt>
                <dd className={cn("m-0 mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 break-words", r.missing && "font-medium text-destructive")}>
                  {r.missing ? (
                    <>
                      <CircleAlert aria-hidden="true" className="size-4" />
                      Missing
                      {onAdd ? <span className="ml-1">{onAdd(r)}</span> : null}
                    </>
                  ) : r.value === null || r.value === undefined || r.value === "" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    r.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
