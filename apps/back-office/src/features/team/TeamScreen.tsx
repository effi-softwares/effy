import { useEffect, useRef, useState } from "react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Check, Minus, Plus, Users } from "lucide-react"

import {
  TEAM_ROLE_WORDS,
  TEAM_STATUS_FILTERS,
  TEAM_STATUS_WORDS,
  type BackOfficeRole,
  type TeamListDTO,
  type TeamMemberDTO,
} from "@effy/shared-types"
import {
  Avatar,
  AvatarFallback,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import {
  DataTable,
  Facet,
  isFiltered,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { isDomainError } from "@effy/api-client"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader, Panel } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { initialsOf } from "@/components/shell/identity"
import { canManageTaxonomy } from "@/features/taxonomy/access"
import { canDebitPoints, canEditPointsSettings } from "@/features/customers/access"
import { canRepairDelivery } from "@/features/deliverability/access"
import { canManageDelivery } from "@/features/delivery/access"
import { canDispatch } from "@/features/dispatch/access"
import { canManageDrivers } from "@/features/drivers/access"
import { canResolveExceptions } from "@/features/exceptions/access"
import { canReplyFeedback } from "@/features/feedback/access"
import { canRecordOrderProgress } from "@/features/orders/access"
import { canDecideReview } from "@/features/product-review/access"
import { canManagePromotions } from "@/features/promotions/access"
import { canManageShops } from "@/features/shops/access"
import { canManageVehicles } from "@/features/vehicles/access"
import { moment } from "@/lib/format"

import { AddPersonDialog } from "./dialogs/AddPersonDialog"
import { ReenableDialog } from "./dialogs/ReenableDialog"
import { NotOnTeamPanel } from "./NotOnTeamPanel"
import { MemberStatus } from "./PersonScreen"
import { teamList } from "./list"
import { TEAM_ROOT } from "./queries"
import { checkSignIn, fetchTeamPage } from "./repo"

type Rule = (roles: readonly BackOfficeRole[]) => boolean

/** What each role may do - each line is the feature's own access rule, so this table cannot drift from the code. */
export const PERMISSIONS: readonly { what: string; rule: Rule }[] = [
  { what: "Read every page", rule: () => true },
  { what: "Record order progress and refunds", rule: canRecordOrderProgress },
  { what: "Assign and plan driver work", rule: canDispatch },
  { what: "Deal with exceptions", rule: canResolveExceptions },
  { what: "Credit customer points", rule: () => true },
  { what: "Remove customer points", rule: canDebitPoints },
  { what: "Reply to feedback", rule: canReplyFeedback },
  { what: "Manage drivers and clearances", rule: canManageDrivers },
  { what: "Manage vehicles", rule: canManageVehicles },
  { what: "Manage shops and their operators", rule: canManageShops },
  { what: "Approve products and set margins", rule: canDecideReview },
  { what: "Edit categories and attributes", rule: canManageTaxonomy },
  { what: "Manage promotion codes and order rules", rule: canManagePromotions },
  { what: "Change delivery, hub and driver settings", rule: canManageDelivery },
  { what: "Re-enable email to an address", rule: canRepairDelivery },
  { what: "Change points settings", rule: canEditPointsSettings },
  { what: "Change tax settings, and see the team", rule: (roles) => roles.includes("admin") },
]

/** The roles in words: one list, in shared-types (119). */
export const ROLE_WORDS: Readonly<Record<BackOfficeRole, string>> = TEAM_ROLE_WORDS

const ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"]

const columns: EffyColumnDef<TeamMemberDTO>[] = [
  {
    id: "person",
    header: "Person",
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        <Avatar aria-hidden="true" className="max-md:hidden">
          <AvatarFallback>{initialsOf(row.original.name || row.original.email)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block truncate">{row.original.name ?? row.original.email}</span>
          {row.original.name ? (
            <span className="block truncate text-sm font-normal text-muted-foreground">{row.original.email}</span>
          ) : null}
        </span>
      </span>
    ),
    meta: { label: "Person", identifying: true, phone: "primary", sortKey: "name" },
  },
  {
    id: "role",
    header: "Role",
    cell: ({ row }) =>
      row.original.role ? ROLE_WORDS[row.original.role] : <span className="text-muted-foreground">No role</span>,
    meta: { label: "Role", phone: "badge", sortKey: "role" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <MemberStatus status={row.original.status} attention={row.original.signInIssue !== null} />,
    meta: { label: "Status", priority: 2 },
  },
  {
    id: "lastSeen",
    header: "Last seen",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.lastSeenAt ? moment(row.original.lastSeenAt) : "Never signed in"}
      </span>
    ),
    meta: { label: "Last seen", phone: "trail", sortKey: "lastSeen" },
  },
  {
    id: "added",
    header: "Added",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.addedAt)}</span>,
    meta: { label: "Added", priority: 3, sortKey: "added" },
  },
]

/** Settings › Team and access (119): the team, adding and finding people, and what each role may do. */
export function TeamScreen() {
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as { tab?: string }
  const state = useListState(teamList, search)
  const f = state.view.filters
  const input = { key: TEAM_ROOT, list: teamList, view: state.view, fetch: fetchTeamPage }
  const team = useQuery(listQueryOptions(input))
  useTourPage("admin-access", { status: tourStatus(team) })
  const navigate = useNavigate()
  const current = search.tab === "roles" ? "roles" : "people"
  const [adding, setAdding] = useState<{ email: string } | null>(null)
  const [reenable, setReenable] = useState<string | null>(null)

  // The pool is compared with the records when the page opens (research R6; skipped within 60 seconds).
  const check = useMutation({
    mutationFn: checkSignIn,
    onSuccess: (out) => {
      if (out.checked) void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
    },
  })
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    check.mutate()
  }, [check])

  const page = team.data as TeamListDTO | undefined
  const notOnTeam = page?.notOnTeam ?? []

  return (
    <>
      <PageHeader
        title="Team and access"
        description="Everyone with a back-office account, their role, and what each role is allowed to do."
        actions={
          <Button data-tour="access.add" onClick={() => setAdding({ email: "" })}>
            <Plus aria-hidden="true" />
            Add person
          </Button>
        }
      />
      <Tabs
        value={current}
        onValueChange={(v) => void navigate({ to: ".", search: v === "roles" ? { tab: "roles" } : {}, replace: true })}
      >
        <div className="ef-tabsbar">
          <div className="ef-tabsbar__list">
            <TabsList aria-label="Team and access">
              <TabsTrigger data-tour="access.team" value="people">
                People
                {page && !f.status && !state.view.q && !f.role ? <TabsCount>{page.total}</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger data-tour="access.roles" value="roles">
                Roles and permissions
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="people" className="ef-tabpanel space-y-6">
          {notOnTeam.length > 0 ? (
            <div data-tour="access.attention">
              <NotOnTeamPanel accounts={notOnTeam} onAdd={(email) => setAdding({ email })} />
            </div>
          ) : null}
          {team.isError && isDomainError(team.error) && team.error.status === 403 ? (
            <ErrorState
              error={team.error}
              onRetry={() => void team.refetch()}
              forbiddenMessage="Only an administrator can see the team."
            />
          ) : (
          <DataTable
            app="back-office"
            label="Team"
            list={teamList}
            state={state}
            columns={columns}
            query={team}
            queryInput={input}
            rowHref={(m) => ({ to: "/settings/team/$staffId", params: { staffId: m.id } })}
            rowClassName={(m) => (m.status !== "active" ? "text-muted-foreground" : undefined)}
            empty={{ icon: Users, title: "No one here.", description: "Add a person to give them back-office access." }}
            toolbar={
              <>
                <Facet
                  tour="access.status"
                  label="Status"
                  value={f.status ?? null}
                  onChange={(v) => state.setFilter("status", v ?? undefined)}
                  options={TEAM_STATUS_FILTERS.map((s) => ({ value: s, label: TEAM_STATUS_WORDS[s] }))}
                />
                <Facet
                  label="Role"
                  value={f.role ?? null}
                  onChange={(v) => state.setFilter("role", v ?? undefined)}
                  options={ROLES.map((r) => ({ value: r, label: ROLE_WORDS[r] }))}
                />
                {isFiltered(state.view) ? <ResetFilters onReset={state.reset} /> : null}
                <SearchBox label="Search name or email" placeholder="Search name or email" value={state.draftQ} onChange={state.setQ} />
              </>
            }
          />
          )}
        </TabsContent>
        <TabsContent value="roles" className="ef-tabpanel">
          <Panel flush title="What each role may do" description="Every role can read every page.">
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permission</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r} className="text-center">
                        {ROLE_WORDS[r]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSIONS.map((p) => (
                    <TableRow key={p.what}>
                      <TableCell>{p.what}</TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          {p.rule([r]) ? (
                            <Check aria-label="Allowed" className="mx-auto size-4 text-success" />
                          ) : (
                            <Minus aria-label="Not allowed" className="mx-auto size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <AddPersonDialog
        key={adding?.email ?? ""}
        open={adding !== null}
        initialEmail={adding?.email ?? ""}
        onOpenChange={(o) => {
          if (!o) setAdding(null)
        }}
        onReenable={setReenable}
      />
      {reenable ? (
        <ReenableDialog memberId={reenable} open onOpenChange={(o) => (o ? undefined : setReenable(null))} />
      ) : null}
    </>
  )
}
