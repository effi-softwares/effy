import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

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
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManagePromotions } from "./access";
import { PromoCodeDialog } from "./components/PromoCodeDialog";
import { DELETE_BLOCKED_CONFLICT, promotionMutationError } from "./errorText";
import { isValueEditable, promoValueLabel, redemptionLabel } from "./model";
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

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const nextStatus: PromoStatus = promo.status === "active" ? "disabled" : "active";
  const used = !isValueEditable(promo);

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/promotions" })}>
          <ArrowLeft />
          All codes
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-semibold">{promo.code}</h1>
            <Badge variant={promo.status === "active" ? "success" : "muted"}>{promo.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{promoValueLabel(promo)}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => {
                setActionError(null);
                setStatus.mutate(
                  { status: nextStatus },
                  { onError: (err) => setActionError(promotionMutationError(err)) },
                );
              }}
            >
              {promo.status === "active" ? "Disable" : "Enable"}
            </Button>
            {/* Delete is offered only for a code that has never been used — for anything else the
                platform refuses it (FR-070) and disabling is the removal path. */}
            {used ? null : (
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                Delete
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      {used ? (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This code has been redeemed {promo.redemptionCount} time{promo.redemptionCount === 1 ? "" : "s"}.
          Its window, caps and status can still change — its value cannot, because paid orders were
          discounted using the definition as it stood.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Definition</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Field label="Takes off" value={promoValueLabel(promo)} />
          <Field
            label="Minimum spend"
            value={Number(promo.minimumSubtotalAmount) > 0 ? `$${promo.minimumSubtotalAmount}` : "None"}
          />
          <Field label="Redeemed" value={redemptionLabel(promo)} />
          <Field label="Starts" value={promo.startsAt ? formatTime(promo.startsAt) : "No lower bound"} />
          <Field label="Ends" value={promo.endsAt ? formatTime(promo.endsAt) : "No upper bound"} />
          <Field
            label="Per shopper"
            value={promo.maxPerCustomer == null ? "Uncapped" : `${promo.maxPerCustomer} use${promo.maxPerCustomer === 1 ? "" : "s"}`}
          />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Attribution</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Field label="Created by" value={promo.createdBy} mono />
          <Field label="Created" value={formatTime(promo.createdAt)} />
          <Field label="Last updated" value={formatTime(promo.updatedAt)} />
        </dl>
      </section>

      <HistorySection promoId={promoId} />

      {canManage ? (
        <>
          <PromoCodeDialog open={editOpen} onOpenChange={setEditOpen} promo={promo} />
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {promo.code}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This code has never been redeemed, so removing it changes no order. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deletePromo.mutate(promoId, {
                      onSuccess: () => void navigate({ to: "/promotions" }),
                      onError: (err) =>
                        setActionError(promotionMutationError(err, DELETE_BLOCKED_CONFLICT)),
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}

function HistorySection({ promoId }: { promoId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(promoHistoryQuery(promoId));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">Audit trail of changes to this code.</p>
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                    No history yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">{formatTime(entry.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.actorSub}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : undefined}>{value}</dd>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
