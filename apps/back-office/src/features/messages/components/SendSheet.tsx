import { useEffect, useState } from "react"

import {
  OPERATING_CITY,
  messageKind,
  peopleWords,
  type MessageDTO,
  type NotificationAudience,
} from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@effy/design-system/ui"

import { fromLocal } from "../draft"
import { messageError, refusalNumber, refusalSlug } from "../errorText"
import { countAudience } from "../repo"
import { useSendMessage } from "../queries"

/** How many people one send reaches now: those who said yes for offers and news, else everyone matched. */
async function countNow(m: MessageDTO): Promise<number> {
  const c = await countAudience({
    kind: m.kind,
    audiences: m.audiences.map((a) => ({ audience: a.audience, filter: a.filter })),
  })
  return c.total
}

/**
 * The last step before anyone is told (112 FR-015): the number of people, in words, and nothing sent until it is
 * confirmed. All customers with no filter also needs the number typed. A manager may send now or pick a time; customer
 * support sends a direct message now.
 */
export function SendSheet({
  message,
  open,
  onOpenChange,
  canSchedule,
  onSent,
}: {
  message: MessageDTO
  open: boolean
  onOpenChange: (open: boolean) => void
  canSchedule: boolean
  onSent: (m: MessageDTO) => void
}) {
  const send = useSendMessage(message.id)
  const [count, setCount] = useState<number | null>(null)
  const [when, setWhen] = useState<"now" | "later">("now")
  const [at, setAt] = useState("")
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const whole = message.audiences.some((a) => a.audience === "customer" && Object.keys(a.filter).length === 0)
  const only: NotificationAudience | null = message.audiences.length === 1 ? message.audiences[0]!.audience : null

  useEffect(() => {
    if (!open) return
    setError(null)
    setTyped("")
    setCount(null)
    countNow(message)
      .then(setCount)
      .catch((e) => setError(messageError(e)))
  }, [open, message])

  const later = when === "later" && at !== ""
  const ready =
    count !== null &&
    count > 0 &&
    (!whole || Number(typed.replace(/[^\d]/g, "")) === count) &&
    (when === "now" || later)

  function go() {
    if (count === null) return
    setError(null)
    send.mutate(
      {
        version: message.version,
        confirmCount: count,
        ...(later ? { sendAt: fromLocal(at)! } : {}),
        ...(whole ? { typedCount: Number(typed.replace(/[^\d]/g, "")) } : {}),
      },
      {
        onSuccess: (m) => {
          onOpenChange(false)
          onSent(m)
        },
        onError: (e) => {
          const slug = refusalSlug(e)
          const n = refusalNumber(e, "count")
          if ((slug === "audience-changed" || slug === "confirmation-required") && n !== null) {
            setCount(n)
            setTyped("")
          }
          setError(messageError(e))
        },
      },
    )
  }

  const people = count === null ? "…" : peopleWords(only, count)
  const marketing = messageKind(message.kind)?.marketing ?? false

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{later ? `Schedule for ${people}?` : `Send to ${people}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {marketing
              ? "Only customers who said yes get it. Their phone choices, the limits and the night hold still apply."
              : "Everyone it's for gets it in their inbox, and on their phone if they're signed in."}{" "}
            Withdrawing it later removes it from inboxes, but not from phones that already showed it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {canSchedule ? (
          <RadioGroup value={when} onValueChange={(v) => setWhen(v as "now" | "later")} className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="now" />
              Send now
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <RadioGroupItem value="later" />
              At
              <Input
                aria-label="Send at"
                type="datetime-local"
                className="w-56"
                value={at}
                disabled={when !== "later"}
                onChange={(e) => setAt(e.target.value)}
              />
              <span className="text-muted-foreground">{OPERATING_CITY} time</span>
            </label>
          </RadioGroup>
        ) : null}

        {whole && count !== null ? (
          <div className="space-y-2">
            <Label htmlFor="send-typed">Type {count.toLocaleString("en-AU")} to send to every customer</Label>
            <Input
              id="send-typed"
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <Button type="button" disabled={!ready || send.isPending} onClick={go} data-tour="messages.confirm">
            {later ? "Schedule" : "Send"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
