import { Check, TriangleAlert } from "lucide-react"

import type { skinContrast, validateSkin } from "@effy/shared-types"
import { Panel, StatusWord } from "@effy/web-kit/patterns"

interface Props {
  issues: ReturnType<typeof validateSkin>
  pairs: ReturnType<typeof skinContrast>
}

export function ReadabilityPanel({ issues, pairs }: Props) {
  return (
    <Panel title="Readable?" description="Every piece of text against what it sits on — normal text 4.5:1, large 3:1.">
      {issues.length > 0 ? (
        <ul className="space-y-1 text-sm" data-testid="skin-issues">
          {issues.map((i) => (
            <li key={i.field} className="flex gap-2">
              <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-destructive" />
              <span>
                <span className="font-mono text-xs">{i.field}</span> — {i.message}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2" data-testid="skin-contrast">
          {pairs.map((p) => (
            <li key={p.pair} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                {p.ok ? (
                  <Check aria-hidden="true" className="size-4 text-success" />
                ) : (
                  <TriangleAlert aria-hidden="true" className="size-4 text-destructive" />
                )}
                {p.label}
              </span>
              <StatusWord tone={p.ok ? "done" : "problem"}>
                {p.ok ? `${p.ratio}:1` : `${p.ratio}:1 — too faint`}
              </StatusWord>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
