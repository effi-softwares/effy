import { Link } from "@tanstack/react-router";

import type { GoLiveReadiness } from "@effy/shared-types";
import { Badge, Button } from "@effy/design-system/ui";

import { fixTarget, ITEM_LABEL } from "./words";

/**
 * The go-live checklist (083 US1): everything the new delivery model needs, whether it is there, and
 * where to fix it. Required items first — any one not ready refuses the switch; an advisory item is a
 * warning the business may accept.
 */
export function ReadinessTable({ readiness, onGoToTab }: { readiness: GoLiveReadiness; onGoToTab: (tab: string) => void }) {
  const items = [...readiness.items].sort((a, b) => Number(b.required) - Number(a.required));
  return (
    <section className="space-y-3" aria-labelledby="golive-readiness">
      <div className="space-y-1">
        <h2 id="golive-readiness" className="text-base font-semibold">Is the platform ready?</h2>
        <p className="text-sm text-muted-foreground" data-testid="readiness-summary">
          {readiness.ready
            ? "Everything the new delivery model needs is in place."
            : "Not yet. The switch is refused until every required item is ready."}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Item</th>
            <th className="py-2 pr-4 font-medium">State</th>
            <th className="py-2 pr-4 font-medium">What is there</th>
            <th className="py-2 font-medium"><span className="sr-only">Where to fix it</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const target = fixTarget(i.fixAt);
            return (
              <tr key={i.key} className="border-b align-top" data-testid={`readiness-item-${i.key}`}>
                <td className="py-2 pr-4 font-medium">
                  {ITEM_LABEL[i.key]}
                  {i.required ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">Advisory</span>}
                </td>
                <td className="py-2 pr-4">
                  {i.ready ? <Badge variant="secondary">Ready</Badge>
                    : i.required ? <Badge variant="destructive">Not ready</Badge>
                    : <Badge variant="outline">Check</Badge>}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{i.detail}</td>
                <td className="py-2 text-right">
                  {"tab" in target ? (
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onGoToTab(target.tab)}>Open</Button>
                  ) : (
                    <Link to={target.href} className="text-sm text-primary underline-offset-4 hover:underline">Open</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
