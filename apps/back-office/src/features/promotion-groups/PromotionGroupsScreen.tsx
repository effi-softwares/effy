import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { LayoutList, Plus } from "lucide-react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState } from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { canManagePromotions } from "@/features/promotions/access"
import { promotionMutationError } from "@/features/promotions/errorText"

import { promotionGroupsQuery, useCreateGroup } from "./queries"

export function PromotionGroupsScreen() {
  const canManage = canManagePromotions(useSessionRoles())
  const { data, error, isPending, isError, refetch } = useQuery(promotionGroupsQuery())
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        back={{ label: "Promotions", link: { to: "/promotions" } }}
        title="Display groups"
        description="The places on the website and app where promotions are shown, and their order."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              New group
            </Button>
          ) : undefined
        }
      />
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-40" aria-busy="true" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title="No display groups yet."
          description="Create one for each place promotions are shown."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Promotions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell data-m="primary">
                      <Link to="/promotions/groups/$groupId" params={{ groupId: g.id }} className="link">
                        {g.name}
                      </Link>
                      {g.description ? (
                        <div className="mt-0.5 block text-sm text-muted-foreground">{g.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell data-m="meta" className="font-mono text-xs">
                      {g.key}
                    </TableCell>
                    <TableCell data-m="trail" className="text-right tabular-nums">
                      {g.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {canManage ? <CreateGroupDialog open={creating} onOpenChange={setCreating} /> : null}
    </>
  )
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

function CreateGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateGroup()
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const k = keyTouched ? key : slug(name)
  const close = () => {
    setName("")
    setKey("")
    setKeyTouched(false)
    setDescription("")
    setError(null)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New display group</DialogTitle>
          <DialogDescription>
            A place promotions are shown. Give the key to whoever builds that place in the website or app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer sale strip"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-key">Key</Label>
            <Input
              id="group-key"
              className="font-mono"
              value={k}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(slug(e.target.value))
              }}
            />
            <p className="mt-0.5 block text-sm text-muted-foreground">
              Lower-case letters, numbers and dashes. It can't be changed later.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-desc">Where it's shown (optional)</Label>
            <Textarea
              id="group-desc"
              rows={2}
              maxLength={240}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !k || create.isPending}
            onClick={() =>
              create.mutate(
                { key: k, name: name.trim(), description: description.trim() || null },
                { onSuccess: close, onError: (e) => setError(promotionMutationError(e)) },
              )
            }
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
