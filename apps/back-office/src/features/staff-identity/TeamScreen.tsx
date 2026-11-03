import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Check, Minus, Users } from "lucide-react"

import type { BackOfficeRole, StaffMemberDTO } from "@effy/shared-types"
import {
  Avatar,
  AvatarFallback,
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
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { ErrorState } from "@effy/web-kit/console"
import { EmptyState, PageHeader, Panel, StatusWord } from "@effy/web-kit/patterns"
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

import { teamQuery } from "./queries"

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

export const ROLE_WORDS: Readonly<Record<BackOfficeRole, string>> = {
  admin: "Administrator",
  manager: "Manager",
  csa: "Customer support",
}

const ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"]

const columns: EffyColumnDef<StaffMemberDTO>[] = [
  {
    id: "person",
    accessorFn: (m) => (m.name ?? m.email).toLowerCase(),
    header: "Person",
    enableSorting: true,
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
    meta: { label: "Person", identifying: true, phone: "primary" },
  },
  {
    id: "role",
    header: "Role",
    cell: ({ row }) =>
      row.original.roles.length === 0 ? (
        <span className="text-muted-foreground">No role - can't use back-office</span>
      ) : (
        row.original.roles.map((r) => ROLE_WORDS[r]).join(", ")
      ),
    meta: { label: "Role", phone: "badge" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "active" ? (
        <StatusWord tone="done">Active</StatusWord>
      ) : (
        <StatusWord tone="quiet">Disabled</StatusWord>
      ),
    meta: { label: "Status", priority: 2 },
  },
  {
    id: "lastSeen",
    accessorFn: (m) => m.lastSeenAt ?? "",
    header: "Last seen",
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.lastSeenAt ? moment(row.original.lastSeenAt) : "Never"}
      </span>
    ),
    meta: { label: "Last seen", phone: "trail" },
  },
]

/** Settings › Team and access (admin): who has a back-office account, and what each role may do. */
export function TeamScreen() {
  const team = useQuery(teamQuery)
  useTourPage("admin-access", { status: tourStatus(team) })
  const { tab } = useSearch({ strict: false }) as { tab?: string }
  const navigate = useNavigate()
  const current = tab === "roles" ? "roles" : "people"
  const active = team.data?.filter((m) => m.status === "active").length

  return (
    <>
      <PageHeader
        title="Team and access"
        description="Everyone with a back-office account, their role, and what each role is allowed to do. Roles are granted in the staff sign-in pool; the platform's staff record decides."
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
                {active !== undefined ? <TabsCount>{active}</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger data-tour="access.roles" value="roles">
                Roles and permissions
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="people" className="ef-tabpanel">
          {team.isError ? (
            <ErrorState
              error={team.error}
              onRetry={() => void team.refetch()}
              forbiddenMessage="Only an administrator can see the team."
            />
          ) : team.data?.length === 0 ? (
            <EmptyState icon={Users} title="No one yet" description="People appear here the first time they sign in." />
          ) : (
            <StaticTable
              label="Team"
              columns={columns}
              rows={team.data ?? []}
              getRowId={(m) => m.subject}
              loading={team.isPending}
              rowClassName={(m) => (m.status === "disabled" ? "text-muted-foreground" : undefined)}
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
    </>
  )
}
