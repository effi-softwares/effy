import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"

import type { MessageDTO, MessageTestDTO, NotificationAudience } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"

import { shopDetailQuery } from "@/features/shops/queries"

import { messageError } from "../errorText"
import { testMessage } from "../repo"
import { AUDIENCE_WORD } from "../words"
import { usePeopleSearch, type Person } from "./PeoplePicker"

const KEY = "effy.messages.test-account"

interface Remembered {
  audience: NotificationAudience
  person: Person
}

function remembered(): Partial<Record<NotificationAudience, Person>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<NotificationAudience, Person>>
  } catch {
    return {}
  }
}

function remember(r: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...remembered(), [r.audience]: r.person }))
  } catch {
    // A convenience only: nothing is lost if the browser won't keep it.
  }
}

function outcome(t: MessageTestDTO, kind: MessageDTO["kind"]): string {
  if (t.inbox === "not_written") return `This customer hasn't said yes to ${kind === "news" ? "news" : "offers"}.`
  switch (t.push) {
    case "queued":
      return "Sent. It's in their inbox, and the phone notification is on its way."
    case "held":
      return "Sent to their inbox. The phone notification waits until 08:00."
    case "capped":
      return "Sent to their inbox only: this account is over today's limit for promotional notifications."
    case "skipped":
      return "Sent to their inbox only: this account turned phone notifications off for this kind."
    default:
      return "Sent to their inbox."
  }
}

/** One person by search: a customer or driver account, or a staff member of a chosen shop. */
function Chooser({
  audience,
  value,
  onChange,
}: {
  audience: NotificationAudience
  value: Person | null
  onChange: (p: Person | null) => void
}) {
  const [q, setQ] = useState("")
  const [shop, setShop] = useState<Person | null>(null)
  const found = usePeopleSearch(audience, q)
  const staff = useQuery({ ...shopDetailQuery(shop?.id ?? ""), enabled: audience === "shop" && Boolean(shop) })

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{value.name}</span>
          <span className="block text-muted-foreground">{value.detail}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    )
  }
  if (audience === "shop" && shop) {
    return (
      <ul className="divide-y rounded-md border" aria-label={`Staff at ${shop.name}`}>
        {(staff.data?.users ?? [])
          .filter((u) => u.status === "active")
          .map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-row-hover"
                onClick={() =>
                  onChange({
                    id: u.id,
                    name: u.name ?? u.email ?? "Staff member",
                    detail: `${shop.name} · ${u.email ?? ""}`,
                  })
                }
              >
                {u.name ?? u.email}
              </button>
            </li>
          ))}
      </ul>
    )
  }
  return (
    <div className="space-y-2">
      <Input
        aria-label={audience === "shop" ? "Find a shop" : `Find a ${audience}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={audience === "shop" ? "Find the shop, then the account" : "Find an account by name or email"}
        autoComplete="off"
      />
      <ul className="divide-y rounded-md border empty:hidden">
        {(found.data ?? []).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-row-hover"
              onClick={() => (audience === "shop" ? setShop(p) : onChange(p))}
            >
              {p.name}
              <span className="ml-2 text-muted-foreground">{p.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Send to me (FR-016): the message to one of the sender's own accounts, every rule applied, not counted. */
export function TestSendDialog({
  message,
  open,
  onOpenChange,
}: {
  message: MessageDTO
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const audiences = message.audiences.map((a) => a.audience)
  const [audience, setAudience] = useState<NotificationAudience>(audiences[0] ?? "driver")
  const [person, setPerson] = useState<Person | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setPerson(remembered()[audience] ?? null)
  }, [open, audience])

  async function go() {
    if (!person) return
    setBusy(true)
    setResult(null)
    try {
      const t = await testMessage(message.id, { audience, personId: person.id })
      remember({ audience, person })
      setResult(outcome(t, message.kind))
    } catch (e) {
      setResult(messageError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to me</DialogTitle>
          <DialogDescription>
            It arrives exactly as others will get it, with “Test:” in front of the title, and isn't counted in the
            report.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {audiences.length > 1 ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={audience}
              onValueChange={(v) => v && setAudience(v as NotificationAudience)}
            >
              {audiences.map((a) => (
                <ToggleGroupItem key={a} value={a} className="px-3">
                  {AUDIENCE_WORD[a]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <div className="space-y-2">
            <Label>Your account</Label>
            <Chooser key={audience} audience={audience} value={person} onChange={setPerson} />
          </div>
          {result ? (
            <p role="status" className="text-sm font-medium">
              {result}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!person || busy} onClick={() => void go()}>
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
