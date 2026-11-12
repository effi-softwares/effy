import { useState } from "react"

import { useQueryClient } from "@tanstack/react-query"

import { MESSAGE_LIMITS, NAME_FALLBACK_DEFAULT, type MessageDestination, type NotificationAudience } from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from "@effy/design-system/ui"

import { DEFAULT_DESTINATION } from "../draft"
import { messageError } from "../errorText"
import { MESSAGES_ROOT } from "../queries"
import { countAudience, createMessage, sendMessage } from "../repo"
import { DestinationPicker } from "./DestinationPicker"

/**
 * Message one person from where staff already are (112 US4): a direct message to this customer or driver, or this
 * shop's staff. It reaches them whatever they chose, and customer support may send it. Sent at once, after a check.
 */
export function DirectMessageDialog({
  audience,
  id,
  name,
  open,
  onOpenChange,
  orders = [],
}: {
  audience: NotificationAudience
  /** The customer, driver or shop. */
  id: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A customer's recent orders: a tap may open one of them. */
  orders?: { id: string; orderNumber: string }[]
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [destination, setDestination] = useState<MessageDestination>(DEFAULT_DESTINATION[audience])
  const [managersOnly, setManagersOnly] = useState(false)
  // 115: a direct message to a customer may go by email too (a service message: no marketing consent needed).
  const [email, setEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = title.trim().length > 0 && body.trim().length > 0

  async function send() {
    setError(null)
    setBusy(true)
    try {
      const filter =
        audience === "shop"
          ? { shops: [id], ...(managersOnly ? { managersOnly: true as const } : {}) }
          : { people: [id] }
      const m = await createMessage({
        kind: "direct",
        title: title.trim(),
        body: body.trim(),
        pictureKey: null,
        push: true,
        email: audience === "customer" && email,
        nameFallback: NAME_FALLBACK_DEFAULT,
        endsAt: null,
        audiences: [{ audience, filter, destination }],
      })
      // The people it reaches now, as the server will count them: one person, or the shop's staff.
      const { total } = await countAudience({ kind: "direct", audiences: [{ audience, filter }] })
      await sendMessage(m.id, { version: m.version, confirmCount: total })
      await qc.invalidateQueries({ queryKey: MESSAGES_ROOT })
      toast("Message sent.")
      setTitle("")
      setBody("")
      onOpenChange(false)
    } catch (e) {
      setError(messageError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {name}</DialogTitle>
          <DialogDescription>
            {audience === "shop" ? "Everyone at this shop gets it" : "They get it"} in their inbox and on their phone,
            whatever they chose. It's listed in Messages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="direct-title">Title</Label>
            <Input
              id="direct-title"
              value={title}
              maxLength={MESSAGE_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="direct-body">Text</Label>
            <Textarea
              id="direct-body"
              rows={4}
              value={body}
              maxLength={MESSAGE_LIMITS.body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {body.trim().length} of {MESSAGE_LIMITS.body}
            </p>
          </div>
          {audience === "customer" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} />
              Also send it by email
            </label>
          ) : null}
          {audience === "shop" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={managersOnly} onCheckedChange={(v) => setManagersOnly(v === true)} />
              Shop managers only
            </label>
          ) : null}
          <div className="space-y-2">
            <span className="text-sm font-medium">Where a tap leads</span>
            <DestinationPicker
              audience={audience}
              value={destination}
              onChange={setDestination}
              extra={orders
                .slice(0, 5)
                .map((o) => ({
                  value: `order-${o.id}`,
                  label: `Order ${o.orderNumber}`,
                  to: { kind: "order", orderId: o.id },
                }))}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!ready || busy} onClick={() => void send()}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
