import { Bell, Image as ImageIcon } from "lucide-react"

import { MESSAGE_LIMITS, type NotificationAudience } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"

import { cut, type MessageDraft } from "../draft"
import { AUDIENCE_WORD, destinationWords } from "../words"

const APP: Record<NotificationAudience, string> = { customer: "Effy", driver: "Effy Driver", shop: "Effy Shop" }

/**
 * The message as people will see it (112 FR-005): a locked iPhone and Android phone, the inbox row and the opened
 * item, for one audience. Drawings of the real surfaces, so they are framed like them; nothing here is content
 * laid out as cards.
 */
export function Previews({ draft, audience }: { draft: MessageDraft; audience: NotificationAudience }) {
  const title = draft.title.trim() || "Your title"
  const body = draft.body.trim() || "Your text appears here."
  const { ios, android } = MESSAGE_LIMITS.lockScreen
  const marketing = draft.kind === "offer" || draft.kind === "news"
  return (
    <div className="space-y-5" data-tour="messages.previews">
      {draft.push ? (
        <section aria-label="On a locked phone" className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">On a locked phone</h3>
          <div className="rounded-2xl border bg-muted/60 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">{APP[audience]}</span>
              <span>now · iPhone</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{cut(title, ios.title)}</p>
            <p className="text-sm">{cut(body, ios.body)}</p>
          </div>
          <div className="rounded-lg border bg-muted/60 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bell className="size-3.5" aria-hidden="true" />
              <span>{APP[audience]} · now · Android</span>
            </div>
            <div className="mt-1 flex gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{cut(title, android.title)}</p>
                <p className="text-sm">{cut(body, android.body)}</p>
              </div>
              {draft.pictureUrl ? <img src={draft.pictureUrl} alt="" className="size-12 rounded object-cover" /> : null}
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No phone notification: it reaches their inbox only.</p>
      )}

      <section aria-label="In the inbox" className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">In the inbox</h3>
        <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent2" aria-label="Unread" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{body}</p>
          </div>
          <span className="text-xs text-muted-foreground">now</span>
        </div>
      </section>

      <section aria-label="Opened" className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Opened</h3>
        <div className="space-y-3 rounded-lg border bg-background p-4">
          {draft.pictureUrl ? (
            <img src={draft.pictureUrl} alt="" className="aspect-video w-full rounded-md object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ImageIcon className="size-6" aria-hidden="true" />
              <span className="sr-only">No picture</span>
            </div>
          )}
          <p className="text-base font-semibold">{title}</p>
          <p className="whitespace-pre-line text-sm">{body}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" tabIndex={-1}>
              {draft.kind === "offer" ? "See offer" : "Open"}
            </Button>
            {marketing ? (
              <Button type="button" size="sm" variant="outline" tabIndex={-1}>
                {draft.kind === "offer" ? "Stop offers like this" : "Stop news like this"}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {AUDIENCE_WORD[audience]}: a tap opens{" "}
            {destinationWords(draft.audiences[audience].destination).toLowerCase()}.
          </p>
        </div>
      </section>
    </div>
  )
}
