"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/form"

export interface EditorField {
  name: string
  label: string
  initialValue: string
  maxLength: number
  inputMode?: "text" | "tel"
  autoComplete?: string
}

/**
 * Edits one thing about the account in a dialog (centred from `md`, a bottom sheet on a phone). The
 * fields exist only while it is open, so the page at rest has no inputs. A changed value never vanishes
 * silently (cancel, close and Escape all ask), and a failed save keeps what was typed and says why.
 */
export function FieldEditor({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fields: EditorField[]
  /** Resolves to an error to show, or `null` when saved. */
  onSave: (values: Record<string, string>) => Promise<string | null>
}) {
  if (!open) return null
  return (
    <OpenEditor title={title} description={description} fields={fields} onSave={onSave} onClose={() => onOpenChange(false)} />
  )
}

function OpenEditor({
  title,
  description,
  fields,
  onSave,
  onClose,
}: {
  title: string
  description?: string
  fields: EditorField[]
  onSave: (values: Record<string, string>) => Promise<string | null>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.initialValue])))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const dirty = fields.some((f) => values[f.name] !== f.initialValue)

  function attemptClose() {
    if (dirty && !window.confirm("Discard your changes?\n\nWhat you typed here will not be saved.")) return
    onClose()
  }

  function submit() {
    setError(null)
    start(async () => {
      const err = await onSave(values)
      if (err) {
        setError(err)
        return
      }
      onClose()
    })
  }

  return (
    <Dialog
      ref={dialog}
      title={title}
      description={description}
      onDismiss={attemptClose}
      footer={
        <>
          {/* Cancel is the quieter of the two, and never the first thing a thumb lands on. */}
          <Button type="button" variant="outline" onClick={attemptClose} disabled={pending} data-testid="field-editor-cancel">
            Cancel
          </Button>
          <Button type="submit" form="field-editor-form" disabled={pending} aria-busy={pending} data-testid="field-editor-save">
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id="field-editor-form"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className={fields.length > 1 ? "grid grid-cols-2 gap-3" : undefined}>
          {fields.map((field, i) => (
            <div key={field.name} className="flex flex-col gap-2">
              {/* A real label, not a placeholder: a placeholder disappears the moment someone types. */}
              <Label htmlFor={`field-editor-${field.name}`}>{field.label}</Label>
              <Input
                id={`field-editor-${field.name}`}
                autoFocus={i === 0}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                maxLength={field.maxLength}
                inputMode={field.inputMode}
                autoComplete={field.autoComplete}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "field-editor-error" : undefined}
                data-testid={i === 0 ? "field-editor-input" : `field-editor-input-${field.name}`}
              />
            </div>
          ))}
        </div>
        {error ? (
          <p id="field-editor-error" role="alert" data-testid="field-editor-error" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
