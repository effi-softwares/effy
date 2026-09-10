import { useEffect, useState } from "react"
import { X } from "lucide-react"

import {
  SHOP_ORDER_NOTE_MAX_LENGTH,
  SHOP_ORDER_TAG_MAX,
  SHOP_ORDER_TAG_MAX_LENGTH,
} from "@effy/shared-types"

import { DesignSheet, SheetField } from "@/components/console/DesignSheet"

import { orderEditError } from "../errorText"
import { useAddOrderNote, useSetOrderTags } from "../queries"

const FIELD =
  "border-input bg-background focus:border-ring h-9 rounded-md border px-3 text-sm outline-none"

/**
 * "Order tags" — the design's `isOrderTags` sheet: the current tags as removable chips, an "Add a tag"
 * field with its Add button, and Save tags. The whole set is saved at once (the route is ABSOLUTE), so
 * nothing is written until Save. The limits are the service's own.
 */
export function OrderTagsDialog({
  fulfillmentId,
  tags,
  open,
  onOpenChange,
}: {
  fulfillmentId: string
  tags: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const save = useSetOrderTags(fulfillmentId)
  const [draft, setDraft] = useState<string[]>(tags)
  const [text, setText] = useState("")

  useEffect(() => {
    if (open) {
      setDraft(tags)
      setText("")
      save.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [open])

  function add() {
    const t = text.trim().toLowerCase()
    if (!t || draft.includes(t) || draft.length >= SHOP_ORDER_TAG_MAX) return
    setDraft([...draft, t])
    setText("")
  }

  return (
    <DesignSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Order tags"
      description="Tags help you filter and group orders. Only your shop sees them."
      saveLabel="Save tags"
      saving={save.isPending}
      error={save.isError ? orderEditError(save.error) : null}
      onSave={() => save.mutate(text.trim() ? [...new Set([...draft, text.trim().toLowerCase()])] : draft, {
        onSuccess: () => onOpenChange(false),
      })}
    >
      {draft.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {draft.map((t) => (
            <span
              key={t}
              className="border-border bg-muted inline-flex items-center gap-1.5 rounded-full border py-[3px] pr-1.5 pl-2.5 text-[12.5px] whitespace-nowrap"
            >
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => setDraft(draft.filter((x) => x !== t))}
                className="text-muted-foreground hover:bg-background hover:text-foreground grid size-[18px] cursor-pointer place-items-center rounded-full border-none bg-transparent p-0"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <SheetField
        label="Add a tag"
        htmlFor="order-tag"
        hint={draft.length >= SHOP_ORDER_TAG_MAX ? `An order can carry ${SHOP_ORDER_TAG_MAX} tags.` : undefined}
      >
        <div className="flex gap-2">
          <input
            id="order-tag"
            placeholder="Fragile"
            maxLength={SHOP_ORDER_TAG_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
            }}
            className={`${FIELD} flex-1`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!text.trim() || draft.length >= SHOP_ORDER_TAG_MAX}
            className="border-input bg-background hover:bg-accent h-9 cursor-pointer rounded-md border px-3.5 text-[13.5px] font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </SheetField>
    </DesignSheet>
  )
}

/**
 * "Internal note" — the design's `isNote` sheet. ⚠ APPEND-ONLY: there is no edit or delete, so a note
 * someone acted on cannot be quietly rewritten afterwards. It is added to the activity log.
 */
export function OrderNoteDialog({
  fulfillmentId,
  open,
  onOpenChange,
}: {
  fulfillmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const add = useAddOrderNote(fulfillmentId)
  const [body, setBody] = useState("")

  useEffect(() => {
    if (open) {
      setBody("")
      add.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [open])

  return (
    <DesignSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Internal note"
      description="Only the team sees this. It is added to the activity log."
      saveLabel="Add note"
      canSave={body.trim() !== ""}
      saving={add.isPending}
      error={add.isError ? orderEditError(add.error) : null}
      onSave={() => add.mutate(body.trim(), { onSuccess: () => onOpenChange(false) })}
    >
      <SheetField label="Note" htmlFor="order-note">
        <textarea
          id="order-note"
          rows={4}
          maxLength={SHOP_ORDER_NOTE_MAX_LENGTH}
          placeholder="Customer called about the delivery window…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="border-input bg-background focus:border-ring resize-y rounded-md border px-3 py-2.5 text-sm leading-[1.55] outline-none"
        />
      </SheetField>
    </DesignSheet>
  )
}
