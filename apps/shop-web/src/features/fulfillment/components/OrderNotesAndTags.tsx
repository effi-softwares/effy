import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"

import {
  SHOP_ORDER_NOTE_MAX_LENGTH,
  SHOP_ORDER_TAG_MAX,
  SHOP_ORDER_TAG_MAX_LENGTH,
} from "@effy/shared-types"
import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Textarea,
} from "@effy/design-system/ui"

import { orderEditError } from "../errorText"
import { useAddOrderNote, useSetOrderTags } from "../queries"

/**
 * Editing an order's tags (057 A3).
 *
 * ⚠ THE WHOLE SET IS SAVED AT ONCE, matching the route's ABSOLUTE contract: add and remove freely,
 * then save. Nothing is written until "Save", so a half-edited set never reaches the log.
 * The limits are the service's own (`@effy/shared-types`), so the dialog refuses what the server would.
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
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Tags</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Short labels your team can spot at a glance — &ldquo;fragile&rdquo;, &ldquo;call first&rdquo;.
            Only your shop sees them.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input
              aria-label="New tag"
              placeholder="Add a tag"
              maxLength={SHOP_ORDER_TAG_MAX_LENGTH}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!text.trim() || draft.length >= SHOP_ORDER_TAG_MAX}>
              Add
            </Button>
          </form>

          {draft.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">No tags.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {draft.map((t) => (
                <li
                  key={t}
                  className="border-border bg-muted inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-[12px]"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => setDraft(draft.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-foreground grid size-4 cursor-pointer place-items-center rounded-full"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {draft.length >= SHOP_ORDER_TAG_MAX ? (
            <p className="text-muted-foreground text-[12.5px]">An order can carry {SHOP_ORDER_TAG_MAX} tags.</p>
          ) : null}

          {save.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {orderEditError(save.error)}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate(draft, { onSuccess: () => onOpenChange(false) })}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save tags
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

/**
 * Adding an internal note (057 A3). ⚠ APPEND-ONLY, and the dialog says so: there is no edit or
 * delete, so a note someone acted on cannot be quietly rewritten afterwards.
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
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Add an internal note</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            For your team only — the customer never sees it. Notes can&apos;t be edited once added.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-1.5">
          <Label htmlFor="order-note">Note</Label>
          <Textarea
            id="order-note"
            rows={4}
            maxLength={SHOP_ORDER_NOTE_MAX_LENGTH}
            placeholder="e.g. Customer asked us to swap to the lactose-free milk if we're out."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {add.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {orderEditError(add.error)}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={add.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!body.trim() || add.isPending}
            onClick={() => add.mutate(body.trim(), { onSuccess: () => onOpenChange(false) })}
          >
            {add.isPending ? <Loader2 className="animate-spin" /> : null}
            Add note
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
