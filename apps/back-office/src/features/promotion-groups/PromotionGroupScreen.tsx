import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";

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
  Skeleton,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { track } from "@/lib/telemetry";
import { canManagePromotions } from "@/features/promotions/access";
import { promotionMutationError } from "@/features/promotions/errorText";
import { STATE_WORD } from "@/features/promotions/model";
import { PromotionStateWord } from "@/features/promotions/PromotionsListScreen";
import { promotionListQuery } from "@/features/promotions/queries";

import { promotionGroupPreviewQuery, promotionGroupQuery, useDeleteGroup, usePutMembers } from "./queries";

/**
 * One display group (094 US2): its promotions in order — reordered with the arrows — and a preview of
 * what a shopper sees right now, with why each hidden promotion is hidden (FR-025).
 */
export function PromotionGroupScreen({ groupId }: { groupId: string }) {
  const canManage = canManagePromotions(useSessionRoles());
  const navigate = useNavigate();
  const group = useQuery(promotionGroupQuery(groupId));
  const preview = useQuery(promotionGroupPreviewQuery(groupId));
  const candidates = useQuery(promotionListQuery({ page: 1, pageSize: 100 }));
  const put = usePutMembers(groupId);
  const del = useDeleteGroup();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  useHeaderDetail(group.data?.name ?? null);

  if (group.isError) return <ErrorState error={group.error} onRetry={() => void group.refetch()} />;
  if (!group.data) return <Skeleton className="h-60" aria-busy="true" />;
  const g = group.data;
  const ids = g.members.map((m) => m.promotionId);
  const save = (next: string[]) => {
    setError(null);
    put.mutate(next, { onSuccess: () => track({ name: "promotion_group_changed", groupId }), onError: (e) => setError(promotionMutationError(e)) });
  };
  const move = (i: number, by: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    save(next);
  };
  const addable = (candidates.data?.items ?? []).filter((p) => !ids.includes(p.id) && p.state !== "archived" && p.state !== "ended");

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
      {error ? <Callout tone="destructive" title="That didn't work">{error}</Callout> : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Panel title="Promotions, in order" description="Shoppers see them in this order, and only the ones they can use right now." flush>
            {g.members.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nothing in this group yet — the place it fills shows nothing.</p>
            ) : (
              <ol className="divide-y divide-border">
                {g.members.map((m, i) => (
                  <li key={m.promotionId} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link to="/promotions/$promoId" params={{ promoId: m.promotionId }} className="bo-link">
                        {m.headline ?? m.name}
                      </Link>
                      <div className="bo-sub">{m.name}</div>
                    </div>
                    <PromotionStateWord state={m.state} />
                    {canManage ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0 || put.isPending} onClick={() => move(i, -1)}>
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === g.members.length - 1 || put.isPending} onClick={() => move(i, 1)}>
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Remove from group" disabled={put.isPending} onClick={() => save(ids.filter((x) => x !== m.promotionId))}>
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
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="bo-sub">{p.gives}</div>
                    </div>
                    <Button size="sm" variant="outline" disabled={put.isPending} onClick={() => save([...ids, p.id])}>
                      <Plus aria-hidden="true" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
        <aside className="bo-detail__aside">
          <Panel title="What a shopper sees now" description="Signed out — personal offers appear only to the shoppers they are for.">
            {preview.isPending ? (
              <Skeleton className="h-24" />
            ) : preview.data ? (
              <div className="space-y-4">
                {preview.data.shown.length === 0 ? <p className="bo-sub">Nothing — the place is not shown.</p> : null}
                <ol className="space-y-2">
                  {preview.data.shown.map((s) => (
                    <li key={s.id} className="rounded-md border border-border p-3">
                      {s.label ? <div className="bo-sub font-semibold uppercase">{s.label}</div> : null}
                      <div className="text-sm font-semibold">{s.headline}</div>
                      {s.terms ? <div className="bo-sub">{s.terms}</div> : null}
                      {s.code ? <div className="bo-code mt-1">{s.code}</div> : null}
                    </li>
                  ))}
                </ol>
                {preview.data.hidden.length > 0 ? (
                  <div className="space-y-1.5">
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
            <AlertDialogAction onClick={() => del.mutate(groupId, { onSuccess: () => void navigate({ to: "/promotions/groups" }), onError: (e) => setError(promotionMutationError(e)) })}>
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
