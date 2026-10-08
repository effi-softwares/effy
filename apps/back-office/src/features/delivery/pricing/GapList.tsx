import type { PlanGapDTO } from "@effy/shared-types";

import { gapText } from "./gapText";

/** What a draft is missing, in sentences a manager can act on (077 FR-018). Nothing when ready. */
export function GapList({ gaps }: { gaps: PlanGapDTO[] }) {
  if (gaps.length === 0) return <p className="text-sm text-muted-foreground">Ready to activate: this plan prices every distance and every weight.</p>;
  const blocking = gaps.filter((g) => g.blocking);
  const notes = gaps.filter((g) => !g.blocking);
  return (
    <div className="space-y-3 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
      {blocking.length > 0 ? (
        <div>
          <p className="font-medium text-warning">Before this plan can be activated</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {blocking.map((g, i) => <li key={`${g.code}-${i}`}>{gapText(g)}</li>)}
          </ul>
        </div>
      ) : null}
      {notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {notes.map((g, i) => <li key={`${g.code}-${i}`}>{gapText(g)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
