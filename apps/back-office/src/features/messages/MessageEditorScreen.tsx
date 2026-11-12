import { useRef, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { ImagePlus, Send, Trash2, UserRound } from "lucide-react"

import {
  FIRST_NAME_PLACEHOLDER,
  MESSAGE_KINDS,
  MESSAGE_LIMITS,
  MESSAGE_MUST_NAME_EFFY,
  OPERATING_CITY,
  hasFirstNamePlaceholder,
  type MessageDTO,
  type MessageKind,
  type NotificationAudience,
} from "@effy/shared-types"
import { Button, Input, Label, Switch, Textarea, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import { Callout, DetailPageSkeleton, FormSkeleton, PageHeader, Panel, PanelSkeleton } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageMessages } from "./access"
import { AudienceBuilder, useAudienceCount } from "./components/AudienceBuilder"
import { DestinationPicker } from "./components/DestinationPicker"
import { Previews } from "./components/Previews"
import { SendSheet } from "./components/SendSheet"
import { TestSendDialog } from "./components/TestSendDialog"
import { bodyOf, chosenAudiences, draftOf, draftProblems, emptyDraft, withKind, type MessageDraft } from "./draft"
import { EMAIL_WHO } from "./words"
import { messageError } from "./errorText"
import { messageQuery, useCreateMessage, useUpdateMessage } from "./queries"
import { uploadMessagePicture } from "./repo"
import { AUDIENCE_WORD } from "./words"

/** New message, or edit one (draft or scheduled), or start from a previous one (`from`). */
export function MessageEditorScreen({ messageId, from }: { messageId?: string; from?: string }) {
  const sourceId = messageId ?? from ?? ""
  const loaded = useQuery({ ...messageQuery(sourceId), enabled: Boolean(sourceId) })
  useTourPage("message-editor", { status: sourceId ? tourStatus(loaded) : "ready" })
  if (sourceId && loaded.isError) return <ErrorState error={loaded.error} onRetry={() => void loaded.refetch()} />
  if (sourceId && !loaded.data) return <EditorSkeleton />
  const source = loaded.data ?? null
  return (
    <Editor
      key={source ? `${source.id}:${source.version}:${messageId ? "edit" : "copy"}` : "new"}
      current={messageId ? source : null}
      copyOf={messageId ? null : source}
    />
  )
}

function EditorSkeleton() {
  return (
    <DetailPageSkeleton
      title="New message"
      meta={0}
      actions={0}
      main={
        <>
          <PanelSkeleton title="What kind of message">
            <FormSkeleton fields={1} submit={false} />
          </PanelSkeleton>
          <PanelSkeleton title="Who gets it">
            <FormSkeleton fields={3} submit={false} />
          </PanelSkeleton>
          <PanelSkeleton title="What it says">
            <FormSkeleton labels={["Title", "Text"]} submit={false} />
          </PanelSkeleton>
        </>
      }
      aside={<PanelSkeleton title="As people will see it" />}
    />
  )
}

function Counter({ value, max, cut, cutLabel }: { value: string; max: number; cut: number; cutLabel: string }) {
  const n = value.trim().length
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {n} of {max}
      {n > cut ? ` · a locked phone shows about the first ${cut} (${cutLabel})` : ""}
    </p>
  )
}

function Editor({ current, copyOf }: { current: MessageDTO | null; copyOf: MessageDTO | null }) {
  const navigate = useNavigate()
  const roles = useSessionRoles()
  const canManage = canManageMessages(roles)
  const create = useCreateMessage()
  const update = useUpdateMessage(current?.id ?? "")
  const [d, setD] = useState<MessageDraft>(() =>
    current ? draftOf(current) : copyOf ? draftOf(copyOf, true) : emptyDraft("announcement"),
  )
  const [saved, setSaved] = useState<MessageDTO | null>(current)
  const [dirty, setDirty] = useState(!current)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [preview, setPreview] = useState<NotificationAudience | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const count = useAudienceCount(d)
  useHeaderDetail(current ? current.title : "New message")

  const change = (next: MessageDraft) => {
    setD(next)
    setDirty(true)
  }
  const set = <K extends keyof MessageDraft>(k: K, v: MessageDraft[K]) => change({ ...d, [k]: v })
  const kinds = MESSAGE_KINDS.filter((k) => canManage || k.kind === "direct")
  const chosen = chosenAudiences(d)
  const shown = preview && chosen.includes(preview) ? preview : (chosen[0] ?? "driver")

  if (!canManage) {
    return (
      <>
        <PageHeader back={{ label: "Messages", link: { to: "/messages" } }} title="New message" />
        <p className="text-sm text-muted-foreground">
          Writing a message to many people needs a manager or an administrator. Customer support can message one person
          from their page: More → Send message.
        </p>
      </>
    )
  }

  if (current && current.status !== "draft" && current.status !== "scheduled") {
    return (
      <>
        <PageHeader
          back={{ label: current.title, link: { to: "/messages/$messageId", params: { messageId: current.id } } }}
          title="Edit message"
        />
        <Callout tone="info" title="This message has already gone.">
          A message can be changed until it starts sending. To send it again with changes, duplicate it.
        </Callout>
      </>
    )
  }

  /** Saves the draft when it has changed (a new one is created), and answers the saved message. */
  async function persist(forSend: boolean): Promise<MessageDTO | null> {
    setError(null)
    const problems = draftProblems(d, forSend)
    if (problems.length > 0) {
      setError(problems.join(" "))
      return null
    }
    if (saved && !dirty) return saved
    setBusy(true)
    try {
      const body = bodyOf(d)
      const m = saved
        ? await update.mutateAsync({ ...body, version: saved.version })
        : await create.mutateAsync({ ...body, ...(copyOf ? { fromMessageId: copyOf.id } : {}) })
      setSaved(m)
      setDirty(false)
      if (!saved) await navigate({ to: "/messages/$messageId/edit", params: { messageId: m.id }, replace: true })
      return m
    } catch (e) {
      setError(messageError(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function addPicture(file: File) {
    const m = await persist(false)
    if (!m) return
    setBusy(true)
    try {
      const key = await uploadMessagePicture(m.id, file)
      change({ ...d, pictureKey: key, pictureUrl: URL.createObjectURL(file) })
    } catch (e) {
      setError(
        e instanceof Error && !("kind" in e)
          ? "That picture couldn't be uploaded. Use a JPEG, PNG or WebP up to 5 MB."
          : messageError(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const title = current ? "Edit message" : "New message"
  const marketing = d.kind === "offer" || d.kind === "news"

  return (
    <>
      <PageHeader
        back={
          current
            ? { label: current.title, link: { to: "/messages/$messageId", params: { messageId: current.id } } }
            : { label: "Messages", link: { to: "/messages" } }
        }
        title={title}
        description="Write it once, choose who gets it, see it as they will, then send it now or later."
      />

      <form
        className="ef-detail"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void persist(false)
        }}
      >
        <div className="ef-detail__main">
          <Panel tour="messages.kind" title="What kind of message">
            <div className="space-y-3">
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="Kind"
                value={d.kind}
                onValueChange={(v) => v && change(withKind(d, v as MessageKind))}
                className="flex-wrap"
              >
                {kinds.map((k) => (
                  <ToggleGroupItem key={k.kind} value={k.kind} className="px-3">
                    {k.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">
                {MESSAGE_KINDS.find((k) => k.kind === d.kind)?.description}
              </p>
              {d.kind === "important" ? (
                <Callout tone="info" title="Important is for service messages only.">
                  Deliveries, safety, their account. Never offers: they reach everyone, at any hour, whatever they
                  chose.
                </Callout>
              ) : null}
            </div>
          </Panel>

          <Panel title="Who gets it">
            <AudienceBuilder draft={d} onChange={change} count={count.data} />
          </Panel>

          <Panel tour="messages.words" title="What it says">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="message-title">Title</Label>
                <Input
                  id="message-title"
                  value={d.title}
                  maxLength={MESSAGE_LIMITS.title}
                  onChange={(e) => set("title", e.target.value)}
                />
                <Counter
                  value={d.title}
                  max={MESSAGE_LIMITS.title}
                  cut={MESSAGE_LIMITS.lockScreen.ios.title}
                  cutLabel="the rest is cut off"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="message-body">Text</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-tour="messages.first-name"
                    onClick={() => {
                      // 115: the person's first name, filled in their inbox and email; never on a lock screen.
                      const el = bodyRef.current
                      const at = el ? el.selectionStart : d.body.length
                      const end = el ? el.selectionEnd : d.body.length
                      set("body", `${d.body.slice(0, at)}${FIRST_NAME_PLACEHOLDER}${d.body.slice(end)}`)
                    }}
                  >
                    <UserRound aria-hidden="true" />
                    Insert first name
                  </Button>
                </div>
                <Textarea
                  id="message-body"
                  ref={bodyRef}
                  rows={5}
                  value={d.body}
                  maxLength={MESSAGE_LIMITS.body}
                  onChange={(e) => set("body", e.target.value)}
                />
                <Counter
                  value={d.body}
                  max={MESSAGE_LIMITS.body}
                  cut={MESSAGE_LIMITS.lockScreen.android.body}
                  cutLabel="the inbox shows it all"
                />
                {marketing ? <p className="text-sm text-muted-foreground">{MESSAGE_MUST_NAME_EFFY}</p> : null}
              </div>
              {hasFirstNamePlaceholder(d.body) ? (
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="message-fallback">When someone has no first name</Label>
                  <Input
                    id="message-fallback"
                    value={d.nameFallback}
                    maxLength={20}
                    onChange={(e) => set("nameFallback", e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Phone notifications always use this word: a name never shows on a lock screen.
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <span className="text-sm font-medium">Picture (optional)</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void addPicture(f)
                    e.target.value = ""
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  {d.pictureUrl ? (
                    <img src={d.pictureUrl} alt="" className="h-16 w-28 rounded-md border object-cover" />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImagePlus aria-hidden="true" />
                    {d.pictureUrl ? "Change picture" : "Add a picture"}
                  </Button>
                  {d.pictureUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => change({ ...d, pictureKey: null, pictureUrl: null })}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  Shown when the message is opened, and on Android phones. JPEG, PNG or WebP, up to 5 MB.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Where a tap leads">
            <div className="space-y-6">
              {chosen.map((a) => (
                <div key={a} className="space-y-2">
                  {chosen.length > 1 ? <h3 className="text-sm font-medium">{AUDIENCE_WORD[a]}</h3> : null}
                  <DestinationPicker
                    audience={a}
                    value={d.audiences[a].destination}
                    onChange={(destination) =>
                      change({ ...d, audiences: { ...d.audiences, [a]: { ...d.audiences[a], destination } } })
                    }
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="How and until when" description={`${OPERATING_CITY} time.`}>
            <div className="space-y-5">
              {d.kind !== "direct" ? (
                <label className="flex items-center gap-3 text-sm">
                  <Switch checked={d.push} onCheckedChange={(on) => set("push", on)} />
                  Also send a phone notification
                </label>
              ) : null}
              {chosen.includes("customer") ? (
                <div className="space-y-1" data-tour="messages.email">
                  <label className="flex items-center gap-3 text-sm">
                    <Switch checked={d.email} onCheckedChange={(on) => set("email", on)} />
                    Also send it by email
                  </label>
                  <p className="pl-12 text-sm text-muted-foreground">{EMAIL_WHO[marketing ? "marketing" : "service"]}</p>
                </div>
              ) : null}
              <div className="max-w-xs space-y-2">
                <Label htmlFor="message-ends">Ends (optional)</Label>
                <Input
                  id="message-ends"
                  type="datetime-local"
                  value={d.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  It leaves every inbox then, and a notification not yet shown is never sent.
                </p>
              </div>
            </div>
          </Panel>

          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-5 py-3">
            <span className="text-sm text-muted-foreground">
              {saved && !dirty ? "Saved" : saved ? "Unsaved changes" : "Not saved yet"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={busy}>
                Save draft
              </Button>
              <Button
                type="button"
                variant="outline"
                data-tour="messages.send-to-me"
                disabled={busy}
                onClick={async () => {
                  if (await persist(true)) setTesting(true)
                }}
              >
                <UserRound aria-hidden="true" />
                Send to me
              </Button>
              <Button
                type="button"
                data-tour="messages.send"
                disabled={busy}
                onClick={async () => {
                  if (await persist(true)) setSending(true)
                }}
              >
                <Send aria-hidden="true" />
                Send…
              </Button>
            </div>
          </div>
        </div>

        <aside className="ef-detail__aside">
          <Panel title="As people will see it">
            <div className="space-y-4">
              {chosen.length > 1 ? (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-label="Preview for"
                  value={shown}
                  onValueChange={(v) => v && setPreview(v as NotificationAudience)}
                >
                  {chosen.map((a) => (
                    <ToggleGroupItem key={a} value={a} className="px-3">
                      {AUDIENCE_WORD[a]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : null}
              <Previews draft={d} audience={shown} />
            </div>
          </Panel>
        </aside>
      </form>

      {saved ? (
        <>
          <SendSheet
            message={saved}
            open={sending}
            onOpenChange={setSending}
            canSchedule={canManage}
            onSent={(m) => void navigate({ to: "/messages/$messageId", params: { messageId: m.id } })}
          />
          <TestSendDialog message={saved} open={testing} onOpenChange={setTesting} />
        </>
      ) : null}
    </>
  )
}
