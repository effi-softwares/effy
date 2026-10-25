import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Coins, History } from "lucide-react"

import type { PointsSettingsDTO } from "@effy/shared-types"
import { Button, Input, Label, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { Panel } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"

import { canEditPointsSettings } from "../access"
import { pointsActionError } from "../errorText"
import { pointsSettingsQuery, useUpdatePointsSettings } from "../queries"

type Field = "centsPerPoint" | "expiryMonths" | "csaCreditLimitPoints" | "warningDays" | "holdMinutes"

const FIELDS: { key: Field; label: string; help: string }[] = [
  {
    key: "centsPerPoint",
    label: "Value of a point (cents)",
    help: "Applies to new orders. Orders already paid keep the value they were paid at.",
  },
  { key: "expiryMonths", label: "Points last (months)", help: "Applies to points credited from now on." },
  {
    key: "csaCreditLimitPoints",
    label: "Customer-service credit limit",
    help: "The most a customer-service agent can credit at once.",
  },
  {
    key: "warningDays",
    label: "Expiry warning (days before)",
    help: "Customers are emailed once, this many days before points expire.",
  },
  {
    key: "holdMinutes",
    label: "Checkout hold (minutes)",
    help: "How long points chosen at checkout are set aside while the customer pays.",
  },
]

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))

export function PointsSettingsPanel() {
  const { data: session } = useQuery(sessionQuery)
  const editable = canEditPointsSettings(session?.status === "signed-in" ? session.identity.roles : [])
  const settings = useQuery(pointsSettingsQuery)
  const save = useUpdatePointsSettings()
  const [draft, setDraft] = useState<Record<Field, string> | null>(null)

  useEffect(() => {
    if (settings.data && draft === null) {
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings.data[f.key])])) as Record<Field, string>)
    }
  }, [settings.data, draft])

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
  if (settings.isPending || draft === null) return <p className="text-sm text-muted-foreground">Loading…</p>

  const s: PointsSettingsDTO = settings.data
  const patch: Partial<PointsSettingsDTO> = {}
  let valid = true
  for (const f of FIELDS) {
    const n = Number(draft[f.key])
    if (!Number.isInteger(n)) valid = false
    else if (n !== s[f.key]) patch[f.key] = n
  }
  const dirty = Object.keys(patch).length > 0

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(patch, {
            onSuccess: (next) => {
              toast("Points settings saved.")
              setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(next[f.key])])) as Record<Field, string>)
            },
            onError: (err) => toast(pointsActionError(err)),
          })
        }}
      >
        <Panel
          title="Rules"
          icon={<Coins aria-hidden="true" />}
          description={
            editable
              ? "Changes apply to points earned or spent from now on."
              : "Only an administrator can change these."
          }
          footer={
            editable ? (
              <>
                {dirty ? <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span> : null}
                <Button type="submit" size="sm" disabled={!dirty || !valid || save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : undefined
          }
        >
          <div>
            {FIELDS.map((f) => (
              <div key={f.key} className="bo-switch-row">
                <div className="min-w-0">
                  <Label htmlFor={`ps-${f.key}`}>{f.label}</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{f.help}</p>
                </div>
                <Input
                  id={`ps-${f.key}`}
                  inputMode="numeric"
                  className="w-32 shrink-0 text-right tabular-nums"
                  value={draft[f.key]}
                  disabled={!editable}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Panel>
      </form>

      <Panel
        title="Changes"
        icon={<History aria-hidden="true" />}
        description="Every change to these rules, newest first."
      >
        {(s.history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ol className="bo-tl">
            {(s.history ?? []).map((h, i) => (
              <li key={i} className="bo-tl__item">
                <span className="bo-tl__mark" aria-hidden="true" />
                <div>
                  <div className="bo-tl__title">{FIELDS.find((f) => f.key === h.field)?.label ?? h.field}</div>
                  <div className="bo-tl__body tabular-nums">
                    {h.oldValue} → {h.newValue}
                  </div>
                </div>
                <span className="bo-tl__time">{when(h.changedAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
