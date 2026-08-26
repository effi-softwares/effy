import { RECEIPT_STATUS_TONES, type ReceiptStatusTone } from "@/app/checkout/_components/status-palette"
import { cn } from "@/lib/utils"

/**
 * A status indicator: a tinted pill, a coloured dot, and a label on the NEUTRAL RAMP.
 *
 * ⚠ THE LABEL IS NEVER THE HUE, and that is what keeps this inside Principle V rather than merely
 * beside it. `--success` has no `-foreground` pair on purpose (4.00:1 — a non-text indicator, not
 * text), so writing the label in the status colour would break the exact rule the palette is an
 * exception to. The dot carries the colour; the word carries the meaning.
 *
 * ⚠ Remove every colour and this still reads correctly. Colour is never the sole carrier (FR-015).
 */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: ReceiptStatusTone
  children: React.ReactNode
  className?: string
}) {
  const t = RECEIPT_STATUS_TONES[tone]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-3",
        "text-[11px] font-semibold uppercase tracking-[0.05em] text-foreground",
        t.tint,
        className,
      )}
    >
      {/* aria-hidden: the label beside it already says everything this dot means. */}
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
      {children}
    </span>
  )
}
