import { useRef, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Save, UserRound } from "lucide-react"

import {
  FIRST_NAME_PLACEHOLDER,
  MESSAGE_KINDS,
  MESSAGE_LIMITS,
  MESSAGE_MUST_NAME_EFFY,
  OPERATING_CITY,
  REPEAT_EVERY,
  TRIGGER_KINDS,
  TRIGGERS,
  WEEKDAY_LABELS,
  hasFirstNamePlaceholder,
  trigger as triggerOf,
  type AutomationDTO,
  type MessageKind,
  type RepeatEvery,
  type TriggerKind,
} from "@effy/shared-types"
import { Button, Input, Label, Switch, Textarea, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import { Callout, DetailPageSkeleton, FormSkeleton, PageHeader, Panel, PanelSkeleton } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageMessages } from "../access"
import { AudienceBuilder, useAudienceCount } from "../components/AudienceBuilder"
import { DestinationPicker } from "../components/DestinationPicker"
import { Previews } from "../components/Previews"
import { withKind } from "../draft"
import { messageError } from "../errorText"
import { EMAIL_WHO } from "../words"
import {
  audienceOf,
  automaticOf,
  automaticProblems,
  bodyOfAutomatic,
  emptyAutomatic,
  oneAudience,
  withMode,
  type AutomaticDraft,
} from "./draft"
import { automationQuery, useCreateAutomation, useUpdateAutomation } from "./queries"
import { AUTOMATIC_RULES, MODE_WORD, TRIGGER_ONCE } from "./words"

/** A new automatic message, or editing one (future runs only). */
export function AutomaticEditorScreen({ automationId }: { automationId?: string }) {
  const loaded = useQuery({ ...automationQuery(automationId ?? ""), enabled: Boolean(automationId) })
  useTourPage("automatic-editor", { status: automationId ? tourStatus(loaded) : "ready" })
  if (automationId && loaded.isError) return <ErrorState error={loaded.error} onRetry={() => void loaded.refetch()} />
  if (automationId && !loaded.data) return <EditorSkeleton />
  return <Editor key={loaded.data ? `${loaded.data.id}:${loaded.data.version}` : "new"} current={loaded.data ?? null} />
}

function EditorSkeleton() {
  return (
    <DetailPageSkeleton
      title="New automatic message"
      meta={0}
      actions={0}
      main={
        <>
          <PanelSkeleton title="When it sends">
            <FormSkeleton fields={2} submit={false} />
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

function Editor({ current }: { current: AutomationDTO | null }) {
  const navigate = useNavigate()
  const canManage = canManageMessages(useSessionRoles())
  const create = useCreateAutomation()
  const update = useUpdateAutomation(current?.id ?? "")
  const [d, setD] = useState<AutomaticDraft>(() => (current ? automaticOf(current) : emptyAutomatic()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const count = useAudienceCount(d.message)
  useHeaderDetail(current ? current.name : "New automatic message")

  const m = d.message
  const setMessage = (next: typeof m) => setD({ ...d, message: oneAudience(m, next) })
  const setWords = <K extends keyof typeof m>(k: K, v: (typeof m)[K]) => setD({ ...d, message: { ...m, [k]: v } })
  const audience = audienceOf(d)
  const kinds = MESSAGE_KINDS.filter((k) => k.kind !== "direct" && (d.mode === "repeat" || TRIGGER_KINDS.includes(k.kind)))
  const marketing = m.kind === "offer" || m.kind === "news"

  if (!canManage) {
    return (
      <>
        <PageHeader back={{ label: "Automatic messages", link: { to: "/messages/automatic" } }} title="Automatic message" />
        <p className="text-sm text-muted-foreground">Automatic messages are set up by a manager or an administrator.</p>
      </>
    )
  }
  if (current && current.status === "finished") {
    return (
      <>
        <PageHeader
          back={{ label: current.name, link: { to: "/messages/automatic/$automationId", params: { automationId: current.id } } }}
          title="Edit automatic message"
        />
        <Callout tone="info" title="This automatic message has ended.">
          It never runs again. Set up a new one to start again.
        </Callout>
      </>
    )
  }

  async function save() {
    setError(null)
    const problems = automaticProblems(d)
    if (problems.length > 0) {
      setError(problems.join(" "))
      return
    }
    setBusy(true)
    try {
      const body = bodyOfAutomatic(d)
      const a = current ? await update.mutateAsync({ ...body, version: current.version }) : await create.mutateAsync(body)
      await navigate({ to: "/messages/automatic/$automationId", params: { automationId: a.id } })
    } catch (e) {
      setError(messageError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        back={
          current
            ? { label: current.name, link: { to: "/messages/automatic/$automationId", params: { automationId: current.id } } }
            : { label: "Automatic messages", link: { to: "/messages/automatic" } }
        }
        title={current ? "Edit automatic message" : "New automatic message"}
        description={current ? "Changes apply to its next runs. Messages it already sent stay as they were." : AUTOMATIC_RULES}
      />

      <form
        className="ef-detail"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="ef-detail__main">
          <Panel title="Name">
            <div className="max-w-md space-y-2">
              <Label htmlFor="automatic-name">Name (staff only)</Label>
              <Input id="automatic-name" value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </div>
          </Panel>

          <Panel tour="automatic.when" title="When it sends" description={`${OPERATING_CITY} time.`}>
            <div className="space-y-5">
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="When it sends"
                value={d.mode}
                onValueChange={(v) => v && setD(withMode(d, v as "trigger" | "repeat"))}
              >
                {(["trigger", "repeat"] as const).map((mode) => (
                  <ToggleGroupItem key={mode} value={mode} className="px-3">
                    {MODE_WORD[mode]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {d.mode === "trigger" ? <TriggerFields d={d} onChange={setD} /> : <RepeatFields d={d} onChange={setD} />}
            </div>
          </Panel>

          <Panel title="What kind of message">
            <div className="space-y-3">
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="Kind"
                value={m.kind}
                onValueChange={(v) => v && setD({ ...d, message: withKind(m, v as MessageKind) })}
                className="flex-wrap"
              >
                {kinds.map((k) => (
                  <ToggleGroupItem key={k.kind} value={k.kind} className="px-3">
                    {k.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">{MESSAGE_KINDS.find((k) => k.kind === m.kind)?.description}</p>
            </div>
          </Panel>

          <Panel title="Who gets it" description="One audience. Each run works out who matches at that moment.">
            <AudienceBuilder draft={m} onChange={setMessage} count={count.data} />
          </Panel>

          <Panel title="What it says">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="automatic-title">Title</Label>
                <Input id="automatic-title" value={m.title} maxLength={MESSAGE_LIMITS.title} onChange={(e) => setWords("title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="automatic-body">Text</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const el = bodyRef.current
                      const at = el ? el.selectionStart : m.body.length
                      const end = el ? el.selectionEnd : m.body.length
                      setWords("body", `${m.body.slice(0, at)}${FIRST_NAME_PLACEHOLDER}${m.body.slice(end)}`)
                    }}
                  >
                    <UserRound aria-hidden="true" />
                    Insert first name
                  </Button>
                </div>
                <Textarea
                  id="automatic-body"
                  ref={bodyRef}
                  rows={5}
                  value={m.body}
                  maxLength={MESSAGE_LIMITS.body}
                  onChange={(e) => setWords("body", e.target.value)}
                />
                {marketing ? <p className="text-sm text-muted-foreground">{MESSAGE_MUST_NAME_EFFY}</p> : null}
              </div>
              {hasFirstNamePlaceholder(m.body) ? (
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="automatic-fallback">When someone has no first name</Label>
                  <Input id="automatic-fallback" value={m.nameFallback} maxLength={20} onChange={(e) => setWords("nameFallback", e.target.value)} />
                  <p className="text-sm text-muted-foreground">Phone notifications always use this word: a name never shows on a lock screen.</p>
                </div>
              ) : null}
            </div>
          </Panel>

          {audience ? (
            <Panel title="Where a tap leads">
              <DestinationPicker
                audience={audience}
                value={m.audiences[audience].destination}
                onChange={(destination) =>
                  setD({ ...d, message: { ...m, audiences: { ...m.audiences, [audience]: { ...m.audiences[audience], destination } } } })
                }
              />
            </Panel>
          ) : null}

          <Panel title="How it reaches them">
            <div className="space-y-5">
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={m.push} onCheckedChange={(on) => setWords("push", on)} />
                Also send a phone notification
              </label>
              {audience === "customer" ? (
                <div className="space-y-1">
                  <label className="flex items-center gap-3 text-sm">
                    <Switch checked={m.email} onCheckedChange={(on) => setWords("email", on)} />
                    Also send it by email
                  </label>
                  <p className="pl-12 text-sm text-muted-foreground">{EMAIL_WHO[marketing ? "marketing" : "service"]}</p>
                </div>
              ) : null}
            </div>
          </Panel>

          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-5 py-3">
            <Button type="submit" data-tour="automatic.save" disabled={busy}>
              <Save aria-hidden="true" />
              {current ? "Save changes" : "Start it"}
            </Button>
          </div>
        </div>

        <aside className="ef-detail__aside">
          <Panel title="As people will see it">
            <Previews draft={m} audience={audience ?? "customer"} />
          </Panel>
        </aside>
      </form>
    </>
  )
}

function TriggerFields({ d, onChange }: { d: AutomaticDraft; onChange: (d: AutomaticDraft) => void }) {
  const t = triggerOf(d.triggerKind)
  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="What has to happen"
        value={d.triggerKind}
        onValueChange={(v) => {
          if (!v) return
          const next = triggerOf(v as TriggerKind)
          onChange({ ...d, triggerKind: next.kind, triggerValue: Math.min(Math.max(d.triggerValue, next.min), next.max) })
        }}
        className="flex-wrap"
      >
        {TRIGGERS.map((x) => (
          <ToggleGroupItem key={x.kind} value={x.kind} className="px-3">
            {x.label} …
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex max-w-xs items-center gap-3">
        <Label htmlFor="automatic-trigger-value" className="shrink-0">
          {t.label}
        </Label>
        <Input
          id="automatic-trigger-value"
          type="number"
          min={t.min}
          max={t.max}
          value={d.triggerValue}
          onChange={(e) => onChange({ ...d, triggerValue: Number(e.target.value) })}
          className="w-24"
        />
        <span className="text-sm">{t.unit}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {t.cadence === "daily" ? "Checked every morning at 7." : "Checked every hour."} {TRIGGER_ONCE}
      </p>
    </div>
  )
}

function RepeatFields({ d, onChange }: { d: AutomaticDraft; onChange: (d: AutomaticDraft) => void }) {
  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="How often"
        value={d.every}
        onValueChange={(v) => v && onChange({ ...d, every: v as RepeatEvery })}
      >
        {REPEAT_EVERY.map((r) => (
          <ToggleGroupItem key={r.every} value={r.every} className="px-3">
            {r.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {d.every === "week" ? (
        <ToggleGroup
          type="multiple"
          variant="outline"
          aria-label="On these days"
          value={d.days.map(String)}
          onValueChange={(v) => onChange({ ...d, days: v.map(Number) })}
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <ToggleGroupItem key={label} value={String(i + 1)} className="px-3">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <div className="grid max-w-lg gap-4 sm:grid-cols-2">
        {d.every === "month" ? (
          <div className="space-y-2">
            <Label htmlFor="automatic-date">On the</Label>
            <Input id="automatic-date" type="number" min={1} max={28} value={d.date} onChange={(e) => onChange({ ...d, date: Number(e.target.value) })} />
            <p className="text-sm text-muted-foreground">1st to 28th, so every month has one.</p>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="automatic-time">At</Label>
          <Input id="automatic-time" type="time" value={d.time} onChange={(e) => onChange({ ...d, time: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="automatic-starts">Starts</Label>
          <Input id="automatic-starts" type="date" value={d.startsOn} onChange={(e) => onChange({ ...d, startsOn: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="automatic-ends">Ends (optional)</Label>
          <Input id="automatic-ends" type="date" value={d.endsOn} onChange={(e) => onChange({ ...d, endsOn: e.target.value })} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        If a run is still sending when the next is due, the next waits for it. Paused runs are never caught up.
      </p>
    </div>
  )
}
