import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
  useResponsiveModalIsMobile,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

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
  wide?: boolean
  cancelLabel?: string
  saveLabel: string
  onSave: () => void
  canSave?: boolean
  saving?: boolean
  destructive?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetBody
        title={title}
        description={description}
        wide={wide}
        cancelLabel={cancelLabel}
        saveLabel={saveLabel}
        onSave={onSave}
        canSave={canSave}
        saving={saving}
        destructive={destructive}
        error={error}
        onCancel={() => onOpenChange(false)}
      >
        {children}
      </SheetBody>
    </ResponsiveModal>
  )
}

function SheetBody({
  title,
  description,
  wide,
  cancelLabel,
  saveLabel,
  onSave,
  canSave,
  saving,
  destructive,
  error,
  onCancel,
  children,
}: {
  title: ReactNode
  description: ReactNode
  wide?: boolean
  cancelLabel: string
  saveLabel: string
  onSave: () => void
  canSave: boolean
  saving: boolean
  destructive: boolean
  error?: string | null
  onCancel: () => void
  children: ReactNode
}) {
  const phone = useResponsiveModalIsMobile()
  const save = (
    <Button
      type="button"
      variant={destructive ? "destructive" : "default"}
      disabled={!canSave || saving}
      onClick={onSave}
      className={cn(phone && "w-full")}
    >
      {saving ? <Loader2 className="animate-spin" /> : null}
      {saveLabel}
    </Button>
  )
  const cancel = (
    <Button type="button" variant="outline" disabled={saving} onClick={onCancel} className={cn(phone && "w-full")}>
      {cancelLabel}
    </Button>
  )
  return (
    <ResponsiveModalContent
      {...(phone ? {} : { showCloseButton: false })}
      className={cn(
        "flex flex-col gap-0 overflow-hidden p-0",
        phone ? "max-h-[92dvh]" : cn("max-h-[86vh]", wide ? "sm:max-w-[620px]" : "sm:max-w-[500px]"),
      )}
    >
      <div className={cn("grid gap-1", phone ? "px-4 pt-3 pb-2" : "px-6 pt-6 pb-2")}>
        <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
        <ResponsiveModalDescription>{description}</ResponsiveModalDescription>
      </div>

      <div className={cn("grid min-h-0 content-start gap-4 overflow-y-auto", phone ? "px-4 py-3" : "px-6 py-4")}>
        {children}
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-foreground">
            {error}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "flex gap-2.5 border-t border-border bg-background",
          phone ? "flex-col px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]" : "justify-end px-6 py-4",
        )}
      >
        {phone ? (
          <>
            {save}
            {cancel}
          </>
        ) : (
          <>
            {cancel}
            {save}
          </>
        )}
      </div>
    </ResponsiveModalContent>
  )
}

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
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-[15px] font-medium">
        {label}
      </label>
      {children}
      {hint ? <div className="text-sm text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

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
    <div className="bo-switch-row">
      <div className="grid gap-0.5">
        <div className="text-[15px] font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{detail}</div>
      </div>
      {control}
    </div>
  )
}
