import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { EyeOff, Plus, Trash2 } from "lucide-react"

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"
import {
  INPUT_TYPE_WORDS,
  LEVEL_ORDER,
  LEVEL_WORDS,
  SECTION_MAX,
  levelRank,
  type AttributeLevel,
  type OwnAttachmentDTO,
} from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"

import { taxonomyErrorText } from "./errorText"
import { attributesQuery, formQuery, useDeleteAttachment, usePutAttachment } from "./queries"

/**
 * A category's attributes: what it inherits (from which category, at which level — tighten or hide it
 * here) and what it attaches itself. Only stricter levels are offered for an inherited attribute.
 */
export function AttachmentEditor({
  categoryId,
  parentId,
  editable,
}: {
  categoryId: string
  parentId: string | null
  editable: boolean
}) {
  const form = useQuery(formQuery(categoryId))
  const parentForm = useQuery({ ...formQuery(parentId ?? ""), enabled: parentId !== null })
  const put = usePutAttachment()
  const remove = useDeleteAttachment()
  const [error, setError] = useState<string | null>(null)

  const inheritedLevel = useMemo(() => {
    const m = new Map<string, AttributeLevel>()
    for (const r of parentForm.data?.sections.flatMap((s) => s.rows) ?? []) m.set(r.attributeId, r.level)
    return m
  }, [parentForm.data])

  if (form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
  if (form.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>

  const rows = form.data.sections.flatMap((s) => s.rows)
  const own = form.data.own ?? []
  const ownIds = new Set(own.map((o) => o.attributeId))
  const inherited = rows.filter((r) => !ownIds.has(r.attributeId))

  const run = async (p: Promise<unknown>) => {
    setError(null)
    try {
      await p
    } catch (err) {
      setError(taxonomyErrorText(err))
    }
  }
  const attach = (attributeId: string, body: Parameters<typeof put.mutateAsync>[0]["body"]) =>
    run(put.mutateAsync({ categoryId, attributeId, body }))
  const detach = (attributeId: string) => run(remove.mutateAsync({ categoryId, attributeId }))
  const busy = put.isPending || remove.isPending

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="ef-section-title">Inherited</h3>
        {inherited.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is inherited from above.</p>
        ) : (
          <div className="ef-table-wrap">
            <table className="ef-table ef-table--compact">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>From</th>
                  <th>Level</th>
                  {editable ? <th className="sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {inherited.map((r) => (
                  <tr key={r.attributeId}>
                    <td>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{INPUT_TYPE_WORDS[r.inputType]}</span>
                    </td>
                    <td className="text-muted-foreground">{r.sourceCategoryName ?? "—"}</td>
                    <td>{LEVEL_WORDS[r.level]}</td>
                    {editable ? (
                      <td>
                        <div className="flex justify-end gap-2">
                          <Stricter
                            current={r.level}
                            disabled={busy}
                            onPick={(level) =>
                              void attach(r.attributeId, { level, section: r.section, position: r.position })
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void attach(r.attributeId, { hidden: true })}
                          >
                            <EyeOff />
                            Hide here
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="ef-section-title">Set on this category</h3>
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="ef-table-wrap">
            <table className="ef-table ef-table--compact">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Level</th>
                  <th>Section</th>
                  <th>Order</th>
                  {editable ? <th className="sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {own.map((o) => (
                  <OwnRow
                    key={o.attributeId}
                    own={o}
                    floor={inheritedLevel.get(o.attributeId) ?? null}
                    editable={editable}
                    busy={busy}
                    onSave={(body) => void attach(o.attributeId, body)}
                    onRemove={() => void detach(o.attributeId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable ? (
          <AttachPicker
            taken={new Set([...rows.map((r) => r.attributeId), ...ownIds])}
            busy={busy}
            onAttach={(id, level) => void attach(id, { level })}
          />
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Stricter({
  current,
  disabled,
  onPick,
}: {
  current: AttributeLevel
  disabled: boolean
  onPick: (l: AttributeLevel) => void
}) {
  const stricter = LEVEL_ORDER.filter((l) => levelRank(l) > levelRank(current))
  if (stricter.length === 0) return null
  return (
    <Select value="" onValueChange={(v) => onPick(v as AttributeLevel)} disabled={disabled}>
      <SelectTrigger className="h-10 w-36" aria-label="Make stricter">
        <SelectValue placeholder="Make stricter" />
      </SelectTrigger>
      <SelectContent>
        {stricter.map((l) => (
          <SelectItem key={l} value={l}>
            {LEVEL_WORDS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function OwnRow({
  own,
  floor,
  editable,
  busy,
  onSave,
  onRemove,
}: {
  own: OwnAttachmentDTO
  /** The level inherited from above, if any: nothing looser is offered. */
  floor: AttributeLevel | null
  editable: boolean
  busy: boolean
  onSave: (body: { level: AttributeLevel; section: string | null; position: number | null }) => void
  onRemove: () => void
}) {
  const [section, setSection] = useState(own.section ?? "")
  const [position, setPosition] = useState(own.position === null ? "" : String(own.position))
  if (own.hidden) {
    return (
      <tr>
        <td className="font-medium">{own.name}</td>
        <td colSpan={3} className="text-muted-foreground">
          Hidden here and below
        </td>
        {editable ? (
          <td>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRemove}>
                Show again
              </Button>
            </div>
          </td>
        ) : null}
      </tr>
    )
  }
  const level = own.level!
  const levels = LEVEL_ORDER.filter((l) => floor === null || levelRank(l) >= levelRank(floor))
  const save = (patch: Partial<{ level: AttributeLevel; section: string; position: string }>) =>
    onSave({
      level: patch.level ?? level,
      section: (patch.section ?? section).trim() || null,
      position: (patch.position ?? position).trim() === "" ? null : Number(patch.position ?? position),
    })
  return (
    <tr>
      <td className="font-medium">{own.name}</td>
      <td>
        <Select value={level} onValueChange={(v) => save({ level: v as AttributeLevel })} disabled={!editable || busy}>
          <SelectTrigger className="h-10 w-36" aria-label={`${own.name} level`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l} value={l}>
                {LEVEL_WORDS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td>
        <Input
          className="h-10 w-40"
          aria-label={`${own.name} section`}
          placeholder="Details"
          maxLength={SECTION_MAX}
          value={section}
          disabled={!editable || busy}
          onChange={(e) => setSection(e.target.value)}
          onBlur={() => section.trim() !== (own.section ?? "") && save({})}
        />
      </td>
      <td>
        <Input
          className="h-10 w-20"
          aria-label={`${own.name} order`}
          inputMode="numeric"
          value={position}
          disabled={!editable || busy}
          onChange={(e) => setPosition(e.target.value.replace(/\D/g, ""))}
          onBlur={() => position !== (own.position === null ? "" : String(own.position)) && save({})}
        />
      </td>
      {editable ? (
        <td>
          <div className="flex justify-end">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${own.name}`}
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
  )
}

/** Attach an active library attribute this category does not already have. */
function AttachPicker({
  taken,
  busy,
  onAttach,
}: {
  taken: Set<string>
  busy: boolean
  onAttach: (id: string, level: AttributeLevel) => void
}) {
  const library = useQuery(attributesQuery())
  const [q, setQ] = useState("")
  const [level, setLevel] = useState<AttributeLevel>("optional")
  const matches = useMemo(() => {
    const w = q.trim().toLowerCase()
    if (!w) return []
    return (library.data ?? [])
      .filter((a) => a.status === "active" && !taken.has(a.id) && a.name.toLowerCase().includes(w))
      .slice(0, 8)
  }, [q, library.data, taken])

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Attach attribute</p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          aria-label="Find an attribute"
          placeholder="Find in the library…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={level} onValueChange={(v) => setLevel(v as AttributeLevel)}>
          <SelectTrigger className="w-40" aria-label="Level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_ORDER.map((l) => (
              <SelectItem key={l} value={l}>
                {LEVEL_WORDS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {matches.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {matches.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {a.name} <span className="text-muted-foreground">· {INPUT_TYPE_WORDS[a.inputType]}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onAttach(a.id, level)
                  setQ("")
                }}
              >
                <Plus />
                Attach
              </Button>
            </li>
          ))}
        </ul>
      ) : q.trim() ? (
        <p className="text-sm text-muted-foreground">No unused attribute matches. Define it in the Attributes tab.</p>
      ) : null}
    </div>
  )
}
