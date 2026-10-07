import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import type { DeliverySlotDTO } from "@effy/shared-types";
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { deliveryMutationError, fieldErrors, SLOT_DUPLICATE } from "../errorText";
import { slotsQuery, useCreateSlot, usePatchSlot } from "../queries";

/**
 * Same-day delivery slots (069 US5).
 *
 * ⚠ LIVE ON SAVE. There is no draft: a slot created here is offered at the next checkout, and one
 * switched off stops being offered at once. The copy under the heading says so, because the screen
 * looks like configuration and behaves like a storefront control.
 *
 * ⚠ A TABLE, not cards (Principle V), and no metric tiles above it: "booked / capacity" is a column
 * on the row it describes.
 *
 * ⚠ There is no delete. A slot is switched off, because placed orders reference it.
 *
 * ⚠ NO LIMIT IS THE DEFAULT. A slot takes every order until its cutoff unless an operator types a
 * limit; `capacity: null` is that state, and an empty field is how it is written.
 */
export function SlotsPanel({ canManage }: { canManage: boolean }) {
  const slots = useQuery(slotsQuery());
  const patch = usePatchSlot();
  const [editing, setEditing] = useState<DeliverySlotDTO | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(slot: DeliverySlotDTO, status: "active" | "disabled") {
    setError(null);
    try {
      await patch.mutateAsync({ slotId: slot.id, body: { status } });
    } catch (err) {
      setError(deliveryMutationError(err));
    }
  }

  const columns: ColumnDef<DeliverySlotDTO>[] = [
    {
      id: "window",
      header: "Window",
      cell: ({ row }) => (
        <span className="font-mono font-medium tabular-nums">
          {row.original.startTime} – {row.original.endTime}
        </span>
      ),
    },
    {
      accessorKey: "cutoffTime",
      header: "Order by",
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.cutoffTime}</span>,
    },
    {
      id: "load",
      header: "Booked today",
      cell: ({ row }) => {
        const s = row.original;
        const full = s.capacity !== null && s.bookedToday >= s.capacity;
        return (
          <span className="tabular-nums">
            {s.capacity === null ? (
              <>
                {s.bookedToday}
                <span className="ml-2 text-muted-foreground">No limit</span>
              </>
            ) : (
              `${s.bookedToday} of ${s.capacity}`
            )}
            {full ? <span className="ml-2 text-muted-foreground">Full</span> : null}
            {s.overCapacityToday > 0 ? (
              // ⚠ Said in words, and never by colour alone. A late payer was honoured above the
              // slot's capacity (FR-009b) — the operator needs to know the evening is one over.
              <span className="ml-2 text-warning">{s.overCapacityToday} over capacity</span>
            ) : null}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.status === "active" ? <Badge>Active</Badge> : <Badge variant="secondary">Off</Badge>,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }: { row: { original: DeliverySlotDTO } }) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
                  Edit
                </Button>
                {row.original.status === "active" ? (
                  <Button variant="ghost" size="sm" disabled={patch.isPending} onClick={() => void setStatus(row.original, "disabled")}>
                    Switch off
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled={patch.isPending} onClick={() => void setStatus(row.original, "active")}>
                    Switch on
                  </Button>
                )}
              </div>
            ),
          } satisfies ColumnDef<DeliverySlotDTO>,
        ]
      : []),
  ];

  const anyActive = (slots.data ?? []).some((s) => s.status === "active");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          The time windows a customer can choose for same-day delivery (Australia/Melbourne). A slot is
          offered until its “order by” time and while a collection run can still bring the goods to the
          hub before it starts. A slot has no limit on deliveries unless you set one. Changes apply to the next checkout; orders
          already placed keep the window they were sold.
        </p>
        {canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" />
            New slot
          </Button>
        ) : null}
      </div>

      {slots.isError ? (
        <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />
      ) : slots.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {!anyActive ? (
            // ⚠ The one consequence an operator must not discover from a customer.
            <p role="status" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
              No slot is active, so same-day delivery is not being offered to anyone.
            </p>
          ) : null}
          {slots.data.length > 0 ? <DataTable columns={columns} data={slots.data} /> : null}
        </>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {editing ? <SlotDialog slot={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SlotDialog({ slot, onClose }: { slot: DeliverySlotDTO | null; onClose: () => void }) {
  const create = useCreateSlot();
  const patch = usePatchSlot();
  const [startTime, setStartTime] = useState(slot?.startTime ?? "");
  const [endTime, setEndTime] = useState(slot?.endTime ?? "");
  const [cutoffTime, setCutoffTime] = useState(slot?.cutoffTime ?? "");
  const [capacity, setCapacity] = useState(slot?.capacity != null ? String(slot.capacity) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || patch.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setError(null);
    const body = {
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      cutoffTime: cutoffTime.trim(),
      // ⚠ Empty is "no limit", sent as null — on an edit that is what REMOVES a limit.
      capacity: capacity.trim() === "" ? null : Number(capacity),
    };
    try {
      if (slot) await patch.mutateAsync({ slotId: slot.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      const named = fieldErrors(err);
      setErrors(named);
      // A refusal that named its fields is shown ON them; the summary line is for everything else.
      if (Object.keys(named).length === 0) setError(deliveryMutationError(err, SLOT_DUPLICATE));
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, placeholder: string, extra?: object) => (
    <div className="space-y-2">
      <Label htmlFor={`slot-${id}`}>{label}</Label>
      <Input
        id={`slot-${id}`}
        value={value}
        placeholder={placeholder}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `slot-${id}-error` : undefined}
        onChange={(e) => set(e.target.value)}
        {...extra}
      />
      {errors[id] ? (
        <p id={`slot-${id}-error`} className="text-sm text-destructive">
          {errors[id]}
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{slot ? "Edit slot" : "New same-day slot"}</DialogTitle>
          <DialogDescription>
            Times are Melbourne time, 24-hour. {slot ? "Orders already placed keep the window they were sold." : "It is offered at checkout as soon as you save."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            {field("startTime", "Starts (HH:MM)", startTime, setStartTime, "17:00", { autoFocus: true })}
            {field("endTime", "Ends (HH:MM)", endTime, setEndTime, "19:00")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("cutoffTime", "Order by (HH:MM)", cutoffTime, setCutoffTime, "15:00")}
            {field("capacity", "Delivery limit (optional)", capacity, setCapacity, "No limit", { inputMode: "numeric" })}
          </div>
          <p className="text-sm text-muted-foreground">
            Leave the limit empty to take every order placed before the cutoff.
          </p>
          {slot && capacity.trim() !== "" && Number(capacity) < slot.bookedToday ? (
            <p className="text-sm text-muted-foreground">
              {slot.bookedToday} deliveries are already booked today. They keep their place; the slot
              takes no more until it is below this number.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {slot ? "Save slot" : "Create slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
