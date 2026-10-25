import { useDeliveryMove } from "../queries"
import { EffyWindowDialog, type EffyWindowDialogCopy } from "./EffyWindowDialog"

const COPY: EffyWindowDialogCopy = {
  title: "Deliver by Effy",
  description:
    "The order goes back to Effy's drivers in the window you choose. The customer is told and pays nothing more.",
  loading: "Finding open windows…",
  empty: "No delivery window is open with room in the next few days.",
  done: "Effy delivers this order again. The customer has been told.",
  legend: "Window",
  submit: "Deliver by Effy",
}

interface Props {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeliverByEffyDialog(props: Props) {
  const move = useDeliveryMove(props.orderId)
  return (
    <EffyWindowDialog
      {...props}
      copy={COPY}
      idPrefix="win"
      checkAllowed
      onSubmit={(chosen) => move.mutateAsync({ to: "effy", ...chosen })}
    />
  )
}
