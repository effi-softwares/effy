import { useState } from "react"

import { useNavigate } from "@tanstack/react-router"

import type { AdminSkinDTO } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@effy/design-system/ui"

import { promotionMutationError } from "@/features/promotions/errorText"

import { useDuplicateSkin } from "./queries"

export function DuplicateSkinDialog({
  skin,
  open,
  onOpenChange,
}: {
  skin: AdminSkinDTO
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const dup = useDuplicateSkin(skin.id)
  const navigate = useNavigate()
  const [name, setName] = useState(`${skin.name} copy`)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate {skin.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="dup-name">Name of the copy</Label>
          <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || dup.isPending}
            onClick={() =>
              dup.mutate(name.trim(), {
                onSuccess: (copy) => {
                  onOpenChange(false)
                  void navigate({ to: "/promotions/skins/$skinId", params: { skinId: copy.id } })
                },
                onError: (e) => setError(promotionMutationError(e)),
              })
            }
          >
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
