import { useState } from "react"

import { ArrowRight } from "lucide-react"

import type { ReviewFieldChangeDTO } from "@effy/shared-types"
import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

import {
  isShopPriceChange,
  priceMove,
  PRICE_RISE_TO_LOOK_AT,
  SECTION_WORDS,
  sectionOfChange,
  signedPercent,
  wordDiff,
  type DiffPart,
} from "./model"

export type DiffLayout = "split" | "unified"

const KEY = "effy.review.diffLayout"

function storedLayout(): DiffLayout {
  try {
    return localStorage.getItem(KEY) === "unified" ? "unified" : "split"
  } catch {
    return "split"
  }
}

/** Long texts are compared word by word; short values (a price, a fact, a code) are shown whole. */
const isText = (c: ReviewFieldChangeDTO) =>
  c.field !== "pictures" && (c.before ?? "").length + (c.after ?? "").length > 40 && !isShopPriceChange(c.field)

/** A shop price is said as product pages say money ("AUD 16.00"); every other value as written. */
const shown = (c: ReviewFieldChangeDTO, value: string | null) =>
  value !== null && isShopPriceChange(c.field) ? `AUD ${value}` : value

/** The layout switch, for the section's head. */
export function DiffLayoutToggle({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        if (v !== "split" && v !== "unified") return
        onChange(v)
        try {
          localStorage.setItem(KEY, v)
        } catch {
          // A private window: the choice lasts for the page.
        }
      }}
      aria-label="How changes are shown"
    >
      <ToggleGroupItem value="split" className="px-3">
        Side by side
      </ToggleGroupItem>
      <ToggleGroupItem value="unified" className="px-3">
        One column
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function useDiffLayout() {
  return useState<DiffLayout>(storedLayout)
}

/**
 * What a change touches, field by field: as it is live and as proposed - side by side or in one column (as a code
 * review reads a diff). A long text marks the words removed and added; a shop price says how far it moves. Each field
 * links to the section of the page where it is marked.
 */
export function ReviewChanges({
  changes,
  picturesChanged,
  layout,
}: {
  changes: readonly ReviewFieldChangeDTO[]
  picturesChanged: boolean
  layout: DiffLayout
}) {
  const rows = [
    ...changes,
    ...(picturesChanged
      ? [{ field: "pictures", label: "Pictures", before: "As they are on sale", after: "A new set - see Pictures" }]
      : []),
  ]
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No details differ from the live product.</p>

  return (
    <div className="overflow-hidden rounded-lg border">
      {rows.map((c) => {
        const section = c.field === "pictures" ? "pictures" : sectionOfChange(c.field)
        const text = isText(c)
        const diff = text ? wordDiff(c.before ?? "", c.after ?? "") : null
        const move = isShopPriceChange(c.field) ? priceMove(c.before, c.after) : null
        const was = diff ? <Parts parts={diff.was} kind="removed" /> : (shown(c, c.before) ?? <Empty />)
        const now = (
          <>
            {diff ? <Parts parts={diff.now} kind="added" /> : (shown(c, c.after) ?? <Empty />)}
            {move !== null ? (
              <span
                className={cn(
                  "ml-2 text-xs font-semibold tabular-nums",
                  move > PRICE_RISE_TO_LOOK_AT ? "text-accent2" : "text-muted-foreground",
                )}
              >
                {signedPercent(move)}
              </span>
            ) : null}
          </>
        )
        return (
          <div
            key={c.field}
            className={cn(
              "grid border-t first:border-t-0 max-md:grid-cols-1",
              layout === "split" ? "grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[200px_minmax(0,1fr)]",
            )}
          >
            <div className="grid content-start gap-1.5 border-r bg-sidebar px-4 py-3.5 max-md:border-r-0 max-md:border-b">
              <span className="font-medium">{c.label}</span>
              <Button
                variant="link"
                className="h-auto w-fit p-0 text-[13px]"
                onClick={() => document.getElementById(section)?.scrollIntoView({ block: "start" })}
              >
                See it in {SECTION_WORDS[section]}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
            {layout === "split" ? (
              <>
                <div className="min-w-0 bg-destructive-soft/40 px-4 py-3.5 break-words whitespace-pre-line">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Live now</span>
                  {was}
                </div>
                <div className="min-w-0 border-l bg-success-soft/60 px-4 py-3.5 break-words whitespace-pre-line max-md:border-t max-md:border-l-0">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Proposed</span>
                  {now}
                </div>
              </>
            ) : (
              <div className="grid min-w-0 gap-2 px-4 py-3.5 break-words whitespace-pre-line">
                <p className="flex gap-3">
                  <span aria-hidden="true" className="w-3 shrink-0 font-mono font-semibold text-destructive">
                    −
                  </span>
                  <span>
                    <span className="sr-only">Live now: </span>
                    {was}
                  </span>
                </p>
                <p className="flex gap-3">
                  <span aria-hidden="true" className="w-3 shrink-0 font-mono font-semibold text-success">
                    +
                  </span>
                  <span>
                    <span className="sr-only">Proposed: </span>
                    {now}
                  </span>
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Parts({ parts, kind }: { parts: readonly DiffPart[]; kind: "removed" | "added" }) {
  return (
    <>
      {parts.map((p, i) =>
        !p.changed ? (
          <span key={i}>{p.text}</span>
        ) : kind === "removed" ? (
          <del key={i} className="rounded-xs bg-destructive/15 decoration-destructive/60">
            <span className="sr-only">removed: </span>
            {p.text}
          </del>
        ) : (
          <ins key={i} className="rounded-xs bg-success/20 no-underline">
            <span className="sr-only">added: </span>
            {p.text}
          </ins>
        ),
      )}
    </>
  )
}

function Empty() {
  return <span className="text-muted-foreground">Nothing</span>
}
