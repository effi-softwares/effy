import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, Palette, Plus, Trash2, X } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@effy/design-system/ui"
import { layoutFits } from "@effy/shared-types"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import {
  Bone,
  Callout,
  DetailPageSkeleton,
  ListSkeleton,
  Loading,
  PageHeader,
  Panel,
  PanelSkeleton,
  StatusWord,
} from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { track } from "@/lib/telemetry"
import { canManagePromotions } from "@/features/promotions/access"
import { promotionMutationError } from "@/features/promotions/errorText"
import { STATE_WORD } from "@/features/promotions/model"
import { PromotionStateWord } from "@/features/promotions/PromotionsListScreen"
import { promotionListQuery } from "@/features/promotions/queries"

import { promotionSkinsQuery } from "@/features/promotion-skins/queries"
import { SIZE_WORD, SkinPreviewItem } from "@/features/promotion-skins/SkinPreview"

import { LookPanel, MemberLookDialog } from "./GroupLook"
import {
  promotionGroupPreviewQuery,
  promotionGroupQuery,
  useDeleteGroup,
  usePutMembers,
  type MemberChoice,
} from "./queries"

export function PromotionGroupScreen({ groupId }: { groupId: string }) {
  const canManage = canManagePromotions(useSessionRoles())
  const navigate = useNavigate()
  const group = useQuery(promotionGroupQuery(groupId))
  const preview = useQuery(promotionGroupPreviewQuery(groupId))
  const candidates = useQuery(promotionListQuery({ page: 1, pageSize: 100 }))
  const put = usePutMembers(groupId)
  const del = useDeleteGroup()
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [choosing, setChoosing] = useState<string | null>(null)
  const skins = useQuery(promotionSkinsQuery())
  useHeaderDetail(group.data?.name ?? null)

  if (group.isError) return <ErrorState error={group.error} onRetry={() => void group.refetch()} />
  if (!group.data) return <GroupSkeleton />
  const g = group.data
  const ids = g.members.map((m) => m.promotionId)
  const choices: MemberChoice[] = g.members.map((m) => ({
    promotionId: m.promotionId,
    skinId: m.skinId,
    imageId: m.imageId,
  }))
  const save = (next: MemberChoice[]) => {
    setError(null)
    put.mutate(next, {
      onSuccess: () => track({ name: "promotion_group_changed", groupId }),
      onError: (e) => setError(promotionMutationError(e)),
    })
  }
  const move = (i: number, by: number) => {
    const next = [...choices]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x!)
    save(next)
  }
  const skinName = (id: string | null) => (id ? (skins.data?.find((k) => k.id === id)?.name ?? "A skin") : null)
  const member = choosing ? g.members.find((m) => m.promotionId === choosing) : undefined
  const addable = (candidates.data?.items ?? []).filter(
    (p) => !ids.includes(p.id) && p.state !== "archived" && p.state !== "ended",
  )

  return (
    <>
      <PageHeader
        back={{ label: "Display groups", link: { to: "/promotions/groups" } }}
        title={g.name}
        description={g.description ?? undefined}
        meta={<span className="font-mono">{g.key}</span>}
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden="true" />
              Delete group
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <Callout tone="destructive" title="That didn't work">
          {error}
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <LookPanel group={g} skins={skins.data ?? []} canManage={canManage} onError={setError} />
          <Panel
            title="Promotions, in order"
            description="Shoppers see them in this order, and only the ones they can use right now."
            flush
          >
            {g.members.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Nothing in this group yet — the place it fills shows nothing.
              </p>
            ) : (
              <ol className="divide-y divide-border">
                {g.members.map((m, i) => (
                  <li key={m.promotionId} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link to="/promotions/$promoId" params={{ promoId: m.promotionId }} className="link">
                        {m.headline ?? m.name}
                      </Link>
                      <div className="mt-0.5 block text-sm text-muted-foreground">
                        {m.name} ·{" "}
                        {skinName(m.skinId) ??
                          `Default (${(m.resolved.code && g.defaultCodeSkin ? g.defaultCodeSkin : g.defaultSkin).name})`}
                      </div>
                    </div>
                    <PromotionStateWord state={m.state} />
                    {canManage ? (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Choose the look of ${m.headline ?? m.name}`}
                          disabled={put.isPending}
                          onClick={() => setChoosing(m.promotionId)}
                        >
                          <Palette aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move up"
                          disabled={i === 0 || put.isPending}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={i === g.members.length - 1 || put.isPending}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove from group"
                          disabled={put.isPending}
                          onClick={() => save(choices.filter((x) => x.promotionId !== m.promotionId))}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {canManage && addable.length > 0 ? (
            <Panel title="Add a promotion" description="Only promotions with a headline can be shown." flush>
              <ul className="divide-y divide-border">
                {addable.slice(0, 20).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="mt-0.5 block text-sm text-muted-foreground">{p.gives}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={put.isPending}
                      onClick={() => save([...choices, { promotionId: p.id, skinId: null, imageId: null }])}
                    >
                      <Plus aria-hidden="true" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
        <aside className="ef-detail__aside">
          <Panel
            title="What a shopper sees now"
            description={`Signed out, in each promotion's skin (${SIZE_WORD[g.size].toLowerCase()} place). Personal offers appear only to the shoppers they are for.`}
          >
            {preview.isPending ? (
              <Loading label="Loading the preview">
                <div className="space-y-3">
                  <Bone kind="block" className="h-24" />
                  <Bone kind="block" className="h-24" />
                </div>
              </Loading>
            ) : preview.data ? (
              <div className="space-y-4">
                {preview.data.shown.length === 0 ? (
                  <p className="mt-0.5 block text-sm text-muted-foreground">Nothing — the place is not shown.</p>
                ) : null}
                <ol className="space-y-3" data-testid="group-preview">
                  {preview.data.shown.map((s) => (
                    <li key={s.id}>
                      <SkinPreviewItem promotion={s} skin={s.skin} />
                    </li>
                  ))}
                </ol>
                {preview.data.hidden.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Hidden right now</div>
                    {preview.data.hidden.map((h) => (
                      <div key={h.promotionId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{h.name}</span>
                        <StatusWord tone="quiet">{h.why === "personal" ? "Personal" : STATE_WORD[h.why]}</StatusWord>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>

      {member ? (
        <MemberLookDialog
          group={g}
          member={member}
          skins={(skins.data ?? []).filter((k) => layoutFits(k.layout, g.size))}
          pending={put.isPending}
          onClose={() => setChoosing(null)}
          onSave={(skinId, imageId) => {
            save(choices.map((c) => (c.promotionId === member.promotionId ? { ...c, skinId, imageId } : c)))
            setChoosing(null)
          }}
        />
      ) : null}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {g.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The group goes; its promotions stay. Anywhere that asks for “{g.key}” will show nothing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                del.mutate(groupId, {
                  onSuccess: () => void navigate({ to: "/promotions/groups" }),
                  onError: (e) => setError(promotionMutationError(e)),
                })
              }
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function GroupSkeleton() {
  return (
    <DetailPageSkeleton
      back={{ label: "Display groups", link: { to: "/promotions/groups" } }}
      description
      meta={0}
      actions={1}
      main={
        <>
          <PanelSkeleton title="How this place looks" rows={2} />
          <PanelSkeleton
            title="Promotions, in order"
            description="Shoppers see them in this order, and only the ones they can use right now."
            flush
          >
            <ListSkeleton rows={4} trailing="chip" inset />
          </PanelSkeleton>
        </>
      }
      aside={
        <PanelSkeleton title="What a shopper sees now" description>
          <div className="space-y-3">
            <Bone kind="block" className="h-24" />
            <Bone kind="block" className="h-24" />
          </div>
        </PanelSkeleton>
      }
    />
  )
}
