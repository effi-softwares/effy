import { HANDOVER_LABEL, hasDeliveryInstructions, type DeliveryInstructionsDTO } from "@effy/shared-types"

export function DeliveryInstructions({ instructions }: { instructions?: DeliveryInstructionsDTO | null }) {
  if (!hasDeliveryInstructions(instructions)) return null
  return (
    <>
      <h3 className="pt-2 text-sm font-medium">Delivery instructions</h3>
      {instructions.handover ? <p className="text-sm">{HANDOVER_LABEL[instructions.handover]}</p> : null}
      {instructions.note ? (
        <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{instructions.note}</p>
      ) : null}
    </>
  )
}
