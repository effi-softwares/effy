import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Pencil, TicketPercent, Trash2 } from "lucide-react";

import type { PromoStatus } from "@effy/shared-types";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { useHeaderDetail } from "@/components/shell/SiteHeader";

import { sessionQuery } from "@/features/auth/queries";

import { canManagePromotions } from "./access";
import { AdvertisingSection } from "./components/AdvertisingSection";
import { PromoCodeDialog } from "./components/PromoCodeDialog";
import { DELETE_BLOCKED_CONFLICT, promotionMutationError } from "./errorText";
import { isValueEditable, promoValueLabel, redemptionLabel } from "./model";
import { activeDates, PromoStateWord } from "./PromotionsListScreen";
import { promoDetailQuery, promoHistoryQuery, useDeletePromo, useSetPromoStatus } from "./queries";

// A code's definition, its usage against its caps, and who changed it (027 FR-067/FR-071). Sectioned
// detail rows rather than metric cards — Principle V.

export function PromotionDetailScreen({ promoId }: { promoId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManagePromotions(roles);

  const navigate = useNavigate();
  const { data: promo, error, isPending, isError, refetch } = useQuery(promoDetailQuery(promoId));

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const setStatus = useSetPromoStatus(promoId);
  const deletePromo = useDeletePromo();

  useHeaderDetail(promo?.code ?? null);
  const [disableOpen, setDisableOpen] = useState(false);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const nextStatus: PromoStatus = promo.status === "active" ? "disabled" : "active";
  const used = !isValueEditable(promo);

  function changeStatus() {
    setActionError(null);
    setStatus.mutate(
      { status: nextStatus },
      { onSuccess: () => setDisableOpen(false), onError: (err) => setActionError(promotionMutationError(err)) },
    );
  }

  return (
    <>
      <PageHeader
        back={{ label: "All codes", link: { to: "/promotions" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="bo-code">{promo.code}</span>
            <PromoStateWord promo={promo} />
          </span>
        }
        meta={
          <>
            <span>
              <TicketPercent aria-hidden="true" />
              {promoValueLabel(promo)}
              {Number(promo.minimumSubtotalAmount) > 0 ? ` orders over $${promo.minimumSubtotalAmount}` : ""}
            </span>
            <span>
              <CalendarDays aria-hidden="true" />
              {activeDates(promo)} (Melbourne)
            </span>
            <span>{redemptionLabel(promo)} used</span>
          </>
        }
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => (promo.status === "active" ? setDisableOpen(true) : changeStatus())}
              >
                {promo.status === "active" ? "Disable" : "Enable"}
              </Button>
              {/* Delete is offered only for a code that has never been used (FR-070). */}
              {used ? null : (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              )}
            </>
          ) : null
        }
      />

      {actionError ? (
        <Callout tone="destructive" title="That didn't work">
          {actionError}
        </Callout>
      ) : null}

      {used ? (
        <Callout tone="info" title={`This code has been redeemed ${promo.redemptionCount} time${promo.redemptionCount === 1 ? "" : "s"}.`}>
          Its window, caps and status can still change — its value cannot, because paid orders were discounted using the definition as it stood.
        </Callout>
      ) : null}

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs defaultValue="storefront">
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
                <TabsList aria-label="Code sections">
                  <TabsTrigger value="storefront">Storefront</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
              </div>
            </div>
            <TabsContent value="storefront" className="bo-tabpanel">
              <AdvertisingSection promo={promo} canManage={canManage} />
            </TabsContent>
            <TabsContent value="history" className="bo-tabpanel">
              <HistorySection promoId={promoId} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="bo-detail__aside is-first">
          <Panel
            title="Definition"
            actions={
              canManage ? (
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              ) : null
            }
          >
            <DetailRows
              tight
              rows={[
                { label: "Takes off", value: promoValueLabel(promo) },
                { label: "Minimum spend", value: Number(promo.minimumSubtotalAmount) > 0 ? `$${promo.minimumSubtotalAmount}` : "None" },
                { label: "Redeemed", value: redemptionLabel(promo) },
                { label: "Starts", value: promo.startsAt ? formatTime(promo.startsAt) : "No lower bound" },
                { label: "Ends", value: promo.endsAt ? formatTime(promo.endsAt) : "No upper bound" },
                {
                  label: "Per shopper",
                  value: promo.maxPerCustomer == null ? "Uncapped" : `${promo.maxPerCustomer} use${promo.maxPerCustomer === 1 ? "" : "s"}`,
                },
              ]}
            />
            <p className="bo-sub mt-3">Times are Melbourne time.</p>
          </Panel>
          <Panel title="Attribution">
            <DetailRows
              tight
              rows={[
                { label: "Created by", value: <span className="font-mono text-xs">{promo.createdBy}</span> },
                { label: "Created", value: formatTime(promo.createdAt) },
                { label: "Last updated", value: formatTime(promo.updatedAt) },
              ]}
            />
          </Panel>
        </aside>
      </div>

      {canManage ? (
        <>
          <PromoCodeDialog open={editOpen} onOpenChange={setEditOpen} promo={promo} />
          <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable {promo.code}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Shoppers can't use it from now on. Orders already discounted keep their discount. Its storefront banner stops showing.
                  You can enable it again at any time — its dates and caps still apply.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it on</AlertDialogCancel>
                <AlertDialogAction onClick={changeStatus}>Disable</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {promo.code}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This code has never been redeemed, so removing it changes no order. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deletePromo.mutate(promoId, {
                      onSuccess: () => void navigate({ to: "/promotions" }),
                      onError: (err) => setActionError(promotionMutationError(err, DELETE_BLOCKED_CONFLICT)),
                    })
                  }
                >
                  Delete code
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </>
  );
}

function HistorySection({ promoId }: { promoId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(promoHistoryQuery(promoId));

  return (
    <Panel title="History" description="Every change to this code, newest first." flush>
      {isError ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      ) : isPending ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{entry.action}</div>
                <div className="bo-sub font-mono">{entry.actorSub}</div>
              </div>
              <span className="bo-sub whitespace-nowrap">{formatTime(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Melbourne",
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}
