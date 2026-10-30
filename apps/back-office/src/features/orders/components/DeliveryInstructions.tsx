import { MessageSquareQuote } from "lucide-react"

import { HANDOVER_LABEL, hasDeliveryInstructions, type DeliveryInstructionsDTO } from "@effy/shared-types"

/** The customer's instructions to the driver, in their own words — said, never rewritten. */
export function DeliveryInstructions({ instructions }: { instructions?: DeliveryInstructionsDTO | null }) {
  if (!hasDeliveryInstructions(instructions)) return null
  return (
    <div className="grid gap-2">
      <h3 className="text-[13px] font-semibold">Delivery instructions</h3>
      <div className="flex gap-2.5 rounded-md bg-muted px-3.5 py-3 text-[13.5px]">
        <MessageSquareQuote aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted-foreground" />
        <div className="grid min-w-0 gap-1">
          {instructions.handover ? <p className="font-medium">{HANDOVER_LABEL[instructions.handover]}</p> : null}
          {instructions.note ? <p className="break-words whitespace-pre-line">{instructions.note}</p> : null}
          <p className="text-xs text-muted-foreground">The customer’s words, for the driver</p>
        </div>
      </div>
    </div>
  )
}
