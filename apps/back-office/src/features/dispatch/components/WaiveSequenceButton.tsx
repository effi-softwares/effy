import { ReasonDialog } from "@/features/exceptions/ReasonDialog"
import { sequenceActionError } from "@/features/exceptions/SequenceSections"

import { useWaiveSequence } from "../queries"

export function WaiveSequenceButton({ roundId, driverName }: { roundId: string; driverName: string }) {
  const waive = useWaiveSequence(roundId)
  return (
    <ReasonDialog
      label="Let this run go ahead"
      title={`Let ${driverName} go ahead with this run?`}
      description="Only when the driver can't do the step before it in the app — for example, their phone died at the hub. The run can then be loaded, or collected, out of order."
      fieldLabel="Why"
      confirmLabel="Let it go ahead"
      onConfirm={async (reason) => {
        try {
          await waive.mutateAsync(reason)
          return null
        } catch (err) {
          return sequenceActionError(err)
        }
      }}
    />
  )
}
