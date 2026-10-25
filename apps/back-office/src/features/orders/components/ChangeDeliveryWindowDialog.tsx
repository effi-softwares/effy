import { useChangeDeliveryWindow } from "../queries"
import { EffyWindowDialog, type EffyWindowDialogCopy } from "./EffyWindowDialog"

const COPY: EffyWindowDialogCopy = {
  title: "Change day or time",
  description:
    "Choose a window, or a day with “Any time” to promise the day without hours. No money moves; the customer's order page shows the new promise.",
  loading: "Finding open days and windows…",
  empty: "No day or window is open with room in the next few days.",
  done: "Saved. The order's delivery has been changed.",
  legend: "Day or window",
  submit: "Save",
}

interface Props {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangeDeliveryWindowDialog(props: Props) {
  const change = useChangeDeliveryWindow(props.orderId)
  return <EffyWindowDialog {...props} copy={COPY} idPrefix="retime" onSubmit={(chosen) => change.mutateAsync(chosen)} />
}
