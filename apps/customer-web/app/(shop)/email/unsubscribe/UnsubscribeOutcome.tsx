"use client"

import { useEffect, useRef, useState } from "react"

import { UNSUBSCRIBE_WORDS } from "@effy/shared-types"

import { CircleCheck, MailX } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ActionButton, ActionLink } from "@/components/storefront/actions"
import { Bone, BoneLines, Loading } from "@/components/ui/skeletons"
import { capture } from "@/lib/telemetry"

import { undoEmailUnsubscribeLink, unsubscribeFromEmailLink } from "./actions"

const SETTINGS = "/account/notifications/settings"

type Phase = "working" | "done" | "failed" | "undone"

/**
 * What following the unsubscribe link did. It posts once, after the page has loaded in a browser (a scanner fetching
 * the HTML runs no script), then says the outcome with Undo while it is offered and a link to settings.
 */
export function UnsubscribeOutcome({ token, messageId }: { token: string; messageId: string | null }) {
  const [phase, setPhase] = useState<Phase>("working")
  const [undoable, setUndoable] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void unsubscribeFromEmailLink(token, messageId).then((r) => {
      setUndoable(r.undoable)
      setPhase(r.ok ? "done" : "failed")
      if (r.ok) capture({ name: "email_unsubscribed", props: {} })
    })
  }, [token, messageId])

  const undo = async () => {
    setUndoing(true)
    const r = await undoEmailUnsubscribeLink(token)
    setUndoing(false)
    if (r.ok) {
      setPhase("undone")
      capture({ name: "email_unsubscribe_undone", props: {} })
    } else {
      setUndoable(false)
    }
  }

  if (phase === "working") return <UnsubscribeSkeleton />
  if (phase === "failed") {
    return (
      <Card icon={MailX} title={UNSUBSCRIBE_WORDS.failed} body={UNSUBSCRIBE_WORDS.failedDetail}>
        <ActionLink href={SETTINGS} size="md" variant="primary">
          Notification settings
        </ActionLink>
      </Card>
    )
  }
  if (phase === "undone") {
    return (
      <Card icon={CircleCheck} title={UNSUBSCRIBE_WORDS.undone} body="">
        <ActionLink href="/" size="md" variant="primary">
          Start shopping
        </ActionLink>
      </Card>
    )
  }
  return (
    <Card icon={CircleCheck} title={UNSUBSCRIBE_WORDS.done} body={UNSUBSCRIBE_WORDS.doneDetail}>
      <div className="flex flex-wrap justify-center gap-3">
        {undoable && (
          <ActionButton type="button" variant="outline" size="md" onClick={undo} disabled={undoing} aria-busy={undoing}>
            {UNSUBSCRIBE_WORDS.undo}
          </ActionButton>
        )}
        <ActionLink href={SETTINGS} size="md" variant="ghost">
          Notification settings
        </ActionLink>
      </div>
    </Card>
  )
}

/** The outcome's own shape while the link is being checked. */
export function UnsubscribeSkeleton() {
  return (
    <Loading label="Checking your link">
      <div className="flex flex-col items-center gap-6 rounded-lg border bg-card p-6 text-center shadow-xs">
        <div className="flex w-full flex-col items-center gap-2">
          <Bone kind="thumb" className="mb-2 size-12" />
          <Bone className="h-7 w-3/4" />
          <BoneLines count={2} className="w-full" />
        </div>
        <Bone className="h-10 w-44 rounded-md" />
      </div>
    </Loading>
  )
}

function Card({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border bg-card p-6 text-center shadow-xs">
      <div className="flex flex-col items-center gap-2">
        <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {children}
    </div>
  )
}
