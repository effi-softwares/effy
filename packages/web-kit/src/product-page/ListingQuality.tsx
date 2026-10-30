import { ArrowRight, CircleAlert, CircleCheck, Circle } from "lucide-react";

import { cn } from "@effy/design-system";

import type { QualityItem } from "./model";

/** How complete the listing is: a bar with a step per item, then each item, a click away from where it is fixed. */
export function ListingQuality({ items }: { items: readonly QualityItem[] }) {
  return (
    <div>
      <div className="mb-3.5 grid auto-cols-fr grid-flow-col gap-1" aria-hidden="true">
        {items.map((i) => (
          <i
            key={i.key}
            className={cn(
              "h-1.5 rounded-xs bg-muted transition-colors duration-500",
              i.ok ? "bg-success" : i.required ? "bg-destructive" : i.attention ? "bg-accent2" : undefined,
            )}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none gap-1 p-0">
        {items.map((i) => {
          const Icon = i.ok ? CircleCheck : i.required ? CircleAlert : Circle;
          const row = (
            <>
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0",
                  i.ok ? "text-success" : i.required ? "text-destructive" : i.attention ? "text-accent2" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1">{i.label}</span>
              {!i.ok && i.note ? <span className="text-[13px] text-muted-foreground group-hover:hidden">{i.note}</span> : null}
              {i.section ? (
                <ArrowRight aria-hidden="true" className="hidden size-3.5 text-muted-foreground group-hover:block" />
              ) : null}
            </>
          );
          return (
            <li key={i.key}>
              {i.section ? (
                <button
                  type="button"
                  className="group -mx-2 flex w-[calc(100%+16px)] cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => document.getElementById(i.section!)?.scrollIntoView({ block: "start" })}
                >
                  {row}
                  <span className="sr-only">{i.ok ? " — done" : " — go to it"}</span>
                </button>
              ) : (
                <span className="flex items-center gap-2.5 py-1.5 text-sm">{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
