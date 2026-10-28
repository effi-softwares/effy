import * as React from "react"
import * as WheelPickerPrimitive from "@ncdai/react-wheel-picker"

import { cn } from "../cn"

// shadcn's wheel picker (react-wheel-picker), coloured from the tokens: the chosen row sits on `--accent`.
type WheelPickerValue = WheelPickerPrimitive.WheelPickerValue
type WheelPickerOption<T extends WheelPickerValue = string> = WheelPickerPrimitive.WheelPickerOption<T>

function WheelPickerWrapper({
  className,
  ...props
}: React.ComponentProps<typeof WheelPickerPrimitive.WheelPickerWrapper>) {
  return (
    <WheelPickerPrimitive.WheelPickerWrapper
      className={cn("w-full rounded-xl px-1 *:data-rwp:first:*:data-rwp-highlight-wrapper:rounded-s-lg *:data-rwp:last:*:data-rwp-highlight-wrapper:rounded-e-lg", className)}
      {...props}
    />
  )
}

function WheelPicker<T extends WheelPickerValue = string>({
  classNames,
  optionItemHeight = 44,
  ...props
}: WheelPickerPrimitive.WheelPickerProps<T>) {
  return (
    <WheelPickerPrimitive.WheelPicker<T>
      optionItemHeight={optionItemHeight}
      classNames={{
        optionItem: "text-muted-foreground data-disabled:opacity-40",
        highlightWrapper: "bg-accent text-foreground",
        ...classNames,
      }}
      {...props}
    />
  )
}

export { WheelPicker, WheelPickerWrapper }
export type { WheelPickerOption, WheelPickerValue }
