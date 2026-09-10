import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

/**
 * The imported design's modal sheet ("Effy Shop Console.dc.html", the `sheetOpen` block), transcribed
 * once so every order dialog is the same shape: a 470px (or 620px for line pickers) centred panel, a
 * header of title + one muted sentence over a hairline, a scrolling body, and a footer bar with the
 * cancel and save buttons on the right.
 *
 * ⚠ NO CORNER CLOSE BUTTON. The design's modal sheets close from their footer's cancel button (and
 * Escape / the overlay); only its right-side Activity sheet carries an ×.
 */
export function DesignSheet({
  open,
  onOpenChange,
  title,
  description,
  wide,
  cancelLabel = "Cancel",
  saveLabel,
  onSave,
  canSave = true,
  saving = false,
  destructive = false,
  error,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  /** 620px — for sheets that list order lines (refund). */
  wide?: boolean
  cancelLabel?: string
  saveLabel: string
  onSave: () => void
  canSave?: boolean
  saving?: boolean
  /** The save button in the destructive colour (cancelling / can't-supply). */
  destructive?: boolean
  /** Inline failure copy, shown above the footer. */
  error?: string | null
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[86vh] flex-col gap-0 overflow-hidden rounded-[var(--radius)] p-0",
          wide ? "sm:max-w-[620px]" : "sm:max-w-[470px]",
        )}
      >
        <div className="border-border grid gap-1 border-b px-5 pt-[18px] pb-3.5">
          <DialogTitle className="text-[15.5px] font-semibold tracking-[-.015em]">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-[13px] leading-[1.55]">
            {description}
          </DialogDescription>
        </div>

        <div className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 py-[18px]">
          {children}
          {error ? (
            <p role="alert" className="text-destructive text-[12.5px]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="border-border bg-background flex flex-wrap justify-end gap-2.5 border-t px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3.5 text-[13.5px]"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            className="h-9 px-3.5 text-[13.5px]"
            disabled={!canSave || saving}
            onClick={onSave}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A form label in the design's sheets: 13px / 500 above its control. */
export function SheetField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint ? <div className="text-muted-foreground text-[12px]">{hint}</div> : null}
    </div>
  )
}

/** A labelled toggle row: title + muted line on the left, the switch on the right. */
export function SheetToggleRow({
  title,
  detail,
  control,
}: {
  title: ReactNode
  detail: ReactNode
  control: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="grid gap-0.5">
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="text-muted-foreground text-[12.5px]">{detail}</div>
      </div>
      {control}
    </div>
  )
}
