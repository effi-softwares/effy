import { useMemo, useState } from "react"

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
  Textarea,
} from "@effy/design-system/ui"
import { CAPPED_SET_LIMIT, listFullSentence, type AdminPromotionGroupDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"
import { SearchBox, StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"

import {
  Bone,
  EmptyState,
  Loading,
  PageHeader,
} from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { canManagePromotions } from "@/features/promotions/access"
import { promotionMutationError } from "@/features/promotions/errorText"

import { promotionGroupsQuery, useCreateGroup } from "./queries"

const GROUP_COLUMNS: EffyColumnDef<AdminPromotionGroupDTO>[] = [
  {
    id: "group",
    accessorFn: (g) => g.name.toLowerCase(),
    header: "Group",
    cell: ({ row }) => (
      <>
        <Link to="/promotions/groups/$groupId" params={{ groupId: row.original.id }} className="link">
          {row.original.name}
        </Link>
        {row.original.description ? (
          <span className="mt-0.5 block text-sm text-muted-foreground whitespace-normal">{row.original.description}</span>
        ) : null}
      </>
    ),
    meta: { label: "Group", identifying: true, phone: "primary" },
  },
  {
    id: "key",
    accessorFn: (g) => g.key,
    header: "Key",
    cell: ({ row }) => <span className="text-xs">{row.original.key}</span>,
    meta: { label: "Key", align: "mono" },
  },
  {
    id: "promotions",
    accessorFn: (g) => g.count,
    sortDescFirst: true,
    header: "Promotions",
    cell: ({ row }) => row.original.count,
    meta: { label: "Promotions", align: "numeric", phone: "trail" },
  },
]

export function PromotionGroupsScreen() {
  const canManage = canManagePromotions(useSessionRoles())
  const { data, error, isPending, isError, refetch } = useQuery(promotionGroupsQuery())
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState("")
  // The whole set is here (capped at 500, 103 FR-024), so it is searched in the browser, in the groups' own order.
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase()
    return (data ?? []).filter((g) => !w || g.name.toLowerCase().includes(w) || g.key.includes(w))
  }, [data, q])

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
        <Loading>
          <div className="flex flex-wrap items-center gap-2">
            <Bone kind="control" className="w-72 max-w-full" />
          </div>
          <StaticTable label="Display groups" columns={GROUP_COLUMNS} rows={[]} getRowId={(g) => g.id} loading />
        </Loading>
      ) : data.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title="No display groups yet."
          description="Create one for each place promotions are shown."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox label="Search groups" placeholder="Name or key…" value={q} onChange={setQ} />
          </div>
          <StaticTable
            label="Display groups"
            columns={GROUP_COLUMNS}
            rows={rows}
            getRowId={(g) => g.id}
            empty="No group matches."
          />
          {data.length >= CAPPED_SET_LIMIT ? (
            <p className="text-sm text-muted-foreground">{listFullSentence(CAPPED_SET_LIMIT)}</p>
          ) : null}
        </>
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
