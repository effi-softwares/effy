import { Check, CircleCheck, CircleMinus, CircleX, Ellipsis, ImageOff, NotebookPen } from "lucide-react"

import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

import { lineCodes } from "../codes"
import { pickModeOf, type OrderLine } from "../orderConsole"

/**
 * One line of the pick list: its picture, what it is, how many — and the one thing to do with it. A line not yet
 * picked offers Picked (all of it) and, under ⋯, Only some… or Can't supply it; a picked line says what went in the
 * bag and can be undone. The box on the left ticks it for doing several at once from the action bar. The next line
 * to pick, in walking order, is marked.
 */
export function LineRow({
  line,
  editable,
  busy,
  scanned,
  next,
  selected,
  onSelect,
  onPick,
  onUndo,
  onSome,
  onCantSupply,
  onNote,
}: {
  line: OrderLine
  editable: boolean
  busy: boolean
  scanned: boolean
  next: boolean
  selected: boolean
  onSelect: () => void
  onPick: () => void
  onUndo: () => void
  onSome: () => void
  onCantSupply: () => void
  onNote: () => void
}) {
  const mode = pickModeOf(line)
  const short = line.orderedQuantity - line.gatheredQuantity
  return (
    <li
      aria-current={next ? "step" : undefined}
      className={cn(
        "grid grid-cols-[28px_64px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border px-4 py-3.5 transition-colors max-md:grid-cols-[28px_52px_minmax(0,1fr)]",
        mode === "full" && "bg-sidebar",
        mode === "part" && "border-accent2/50",
        mode === "unavailable" && "border-destructive/40",
        next && "border-primary-fill ring-1 ring-primary-fill",
        scanned && "ef-flash",
      )}
    >
      <Checkbox
        aria-label={`Select ${line.name}`}
        checked={selected}
        disabled={!editable || busy || mode !== "none"}
        onCheckedChange={onSelect}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-16 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground max-md:size-13",
          mode === "full" && "opacity-60",
        )}
      >
        {line.imageUrl ? (
          <img src={line.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-5" />
        )}
      </span>
      <div className={cn("min-w-0", mode === "full" && "opacity-60")}>
        <div className="text-[15px] leading-5 font-semibold">{line.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {line.variantLabel ? <span>{line.variantLabel}</span> : null}
          <span className="font-mono whitespace-nowrap text-foreground">{lineCodes(line.variantCode, line.sku)}</span>
          {line.gtin ? <span className="font-mono whitespace-nowrap">{line.gtin}</span> : null}
          {line.refundedQuantity > 0 ? (
            <span className="whitespace-nowrap">{line.refundedQuantity} refunded</span>
          ) : null}
          {line.pickNote ? <span className="whitespace-nowrap">“{line.pickNote}”</span> : null}
          {next ? <Badge variant="info">Next</Badge> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 max-md:col-span-full max-md:justify-end">
        {mode === "none" ? (
          <>
            <span
              aria-label={`${line.orderedQuantity} to pick`}
              className="mr-2 min-w-11 text-center text-[22px] font-semibold tracking-[-0.02em] tabular-nums"
            >
              ×{line.orderedQuantity}
            </span>
            {editable ? (
              <>
                <Button variant="outline" disabled={busy} onClick={onPick} aria-label={`Mark ${line.name} picked`}>
                  <Check aria-hidden="true" />
                  Picked
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={busy} aria-label={`Other outcomes for ${line.name}`}>
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={onSome}>
                      <CircleMinus aria-hidden="true" />
                      Only some…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onNote}>
                      <NotebookPen aria-hidden="true" />
                      Adjust with a note…
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={onCantSupply}>
                      <CircleX aria-hidden="true" />
                      Can&apos;t supply it
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </>
        ) : (
          <>
            <span
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap tabular-nums [&_svg]:size-3.5",
                mode === "full" && "text-success",
                mode === "part" && "text-accent2",
                mode === "unavailable" && "text-destructive",
              )}
            >
              {mode === "full" ? (
                <CircleCheck aria-hidden="true" />
              ) : mode === "part" ? (
                <CircleMinus aria-hidden="true" />
              ) : (
                <CircleX aria-hidden="true" />
              )}
              {mode === "full"
                ? `Picked ${line.gatheredQuantity}`
                : mode === "part"
                  ? `${line.gatheredQuantity} of ${line.orderedQuantity} · ${short} short`
                  : "Can't supply"}
            </span>
            {editable ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onUndo} aria-label={`Undo ${line.name}`}>
                Undo
              </Button>
            ) : null}
          </>
        )}
      </div>
    </li>
  )
}
