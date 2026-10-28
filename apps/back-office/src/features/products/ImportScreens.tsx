import { useMemo, useRef, useState } from "react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from "lucide-react"

import {
  IMPORT_ROWS_MAX,
  PRODUCT_IMPORT_STATE_WORDS,
  type ProductImportDTO,
  type ProductImportProductDTO,
  type ProductImportState,
  type ProductImportSummaryDTO,
} from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { ErrorState, useHeaderBack } from "@effy/web-kit/console"
import {
  DataTable,
  defineListSearch,
  Facet,
  listQueryOptions,
  SearchBox,
  searchFilter,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { Callout, PageHeader, Panel, StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { MarginField } from "@/features/product-review/MarginField"
import { toMargin, type MarginEntry } from "@/features/product-review/model"
import { shopListQuery } from "@/features/shops/queries"
import { pathText, leavesWithPaths } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"
import { moment } from "@/lib/format"

import { canManageProducts } from "./access"
import { downloadTemplate, isSheetFile, readSheetFile, sha256Hex } from "./importFile"
import { importQuery, productKeys } from "./queries"
import { createImport, fetchImportPage, getImportTemplate, startImport } from "./repo"
import { productErrorText } from "./words"

const STATE_TONE: Record<ProductImportState, StatusTone> = {
  checking: "moving",
  checked: "waiting",
  creating: "moving",
  done: "done",
  failed: "problem",
}

const BACK = { label: "Products", link: { to: "/products" } } as const

const IMPORT_STATES = ["checking", "checked", "creating", "done", "failed"] as const satisfies readonly ProductImportState[]

/** Imports in the address (103), mirroring the catalog service's `IMPORT_LIST_SPEC`. */
export const importsList = defineListSearch({
  id: "imports",
  mode: "offset",
  sorts: ["created", "file"] as const,
  defaultSort: "created",
  sortDir: { created: "desc", file: "asc" },
  filters: { shopId: searchFilter.uuid, state: searchFilter.oneOf(IMPORT_STATES) },
})

const importColumns: EffyColumnDef<ProductImportSummaryDTO>[] = [
  {
    id: "file",
    header: "File",
    cell: ({ row }) => (
      <>
        {row.original.fileName}
        {row.original.createdBy ? <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{row.original.createdBy}</span> : null}
      </>
    ),
    meta: { label: "File", identifying: true, phone: "primary", sortKey: "file" },
  },
  { id: "shop", header: "Shop", cell: ({ row }) => row.original.shop.name, meta: { label: "Shop" } },
  {
    id: "state",
    header: "State",
    cell: ({ row }) => <StatusWord tone={STATE_TONE[row.original.state]}>{PRODUCT_IMPORT_STATE_WORDS[row.original.state]}</StatusWord>,
    meta: { label: "State", phone: "badge" },
  },
  {
    id: "rows",
    header: "Rows",
    cell: ({ row }) => `${row.original.counts.ready} of ${row.original.counts.rows} ready`,
    meta: { label: "Rows", align: "numeric", priority: 2 },
  },
  { id: "created", header: "Products created", cell: ({ row }) => row.original.counts.created, meta: { label: "Products created", align: "numeric", priority: 2 } },
  {
    id: "when",
    header: "When",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.createdAt)}</span>,
    meta: { label: "When", sortKey: "created", phone: "trail" },
  },
]

/** Catalogue › Products › Imports: start one from a shop's list, and every import so far (102). */
export function ImportsScreen() {
  useHeaderBack(BACK)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = canManageProducts(useSessionRoles())
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const tree = useQuery(treeQuery())
  const [shopId, setShopId] = useState("")
  const [margin, setMargin] = useState<MarginEntry>({ kind: "percent", value: "" })
  const [leafIds, setLeafIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const historyState = useListState(importsList, useSearch({ strict: false }))
  const history = useQuery(listQueryOptions({ key: productKeys.all, list: importsList, view: historyState.view, fetch: fetchImportPage }))
  const leaves = useMemo(() => leavesWithPaths((tree.data ?? []).filter((c) => c.status === "active")), [tree.data])

  const template = useMutation({
    mutationFn: async () => {
      const t = await getImportTemplate(leafIds)
      await downloadTemplate(t.columns, "effy-product-import.xlsx")
      return t
    },
    onError: (err) => setError(productErrorText(err)),
  })
  const columns = useQuery({
    queryKey: ["products", "import-template", leafIds],
    queryFn: () => getImportTemplate(leafIds),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!isSheetFile(file)) throw new Error("Upload the list as .xlsx or .csv.")
      const sheet = await readSheetFile(file)
      if (sheet.rows.length === 0) throw new Error("The sheet has no rows under its header.")
      if (sheet.rows.length > IMPORT_ROWS_MAX)
        throw new Error(`Import at most ${IMPORT_ROWS_MAX} rows at a time; split the list.`)
      return startImport({
        shopId,
        fileName: file.name,
        fileSha256: await sha256Hex(file),
        margin: toMargin(margin)!,
        ...sheet,
      })
    },
    onSuccess: (i) => {
      void queryClient.invalidateQueries({ queryKey: productKeys.all })
      void navigate({ to: "/products/imports/$importId", params: { importId: i.importId } })
    },
    onError: (err) => setError(err instanceof Error && !("kind" in err) ? err.message : productErrorText(err)),
  })

  const ready = shopId !== "" && toMargin(margin) !== null

  return (
    <>
      <PageHeader
        back={BACK}
        title="Import a shop's list"
        description="Effy creates a shop's products from its spreadsheet. Every row is checked first; nothing is created until you say so."
      />

      {canManage ? (
        <Panel title="New import">
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="import-shop">For which shop</Label>
                <Select
                  value={shopId}
                  onValueChange={(next) => {
                    setShopId(next)
                  }}
                >
                  <SelectTrigger id="import-shop" className="w-full">
                    <SelectValue placeholder="Choose a shop…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(shops.data?.items ?? [])
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <MarginField id="import-margin" shopPrices={[]} value={margin} onChange={setMargin} />
            </div>

            <div className="space-y-2">
              <p id="import-leaves" className="text-sm font-medium">
                Aisles in the list (for their detail columns)
              </p>
              <ul
                aria-labelledby="import-leaves"
                className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-background"
              >
                {leaves.map((l) => {
                  const on = leafIds.includes(l.id)
                  return (
                    <li key={l.id}>
                      <Label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 font-normal hover:bg-row-hover">
                        <Checkbox
                          checked={on}
                          disabled={!on && leafIds.length >= 20}
                          onCheckedChange={(v) =>
                            setLeafIds(v === true ? [...leafIds, l.id] : leafIds.filter((x) => x !== l.id))
                          }
                        />
                        {pathText(l.path)}
                      </Label>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-0.5 block text-sm text-muted-foreground">
                Optional. Each chosen aisle adds a "Detail: …" column for every detail it asks for.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => template.mutate()} disabled={template.isPending}>
                <Download aria-hidden="true" />
                Download the template
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                aria-label="The shop's list"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ""
                  setError(null)
                  if (f) upload.mutate(f)
                }}
              />
              <Button disabled={!ready || upload.isPending} onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden="true" />
                {upload.isPending ? "Reading…" : "Upload the list"}
              </Button>
              {!ready ? (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Choose the shop and Effy's margin first.
                </span>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm font-medium">
                {error}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <Panel
        title="The template's columns"
        description="One row per size; rows with the same Product key are one product."
        flush
      >
        <div className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>What goes in it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(columns.data?.columns ?? []).map((c) => (
                <TableRow key={c.name}>
                  <TableHead scope="row" className="text-left font-medium">
                    {c.name}
                  </TableHead>
                  <TableCell>{c.required ? "Yes" : ""}</TableCell>
                  <TableCell className="text-muted-foreground">{c.help}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="Imports" flush>
        <DataTable
          app="back-office"
          label="Imports"
          list={importsList}
          state={historyState}
          columns={importColumns}
          query={history}
          rowId={(i) => i.importId}
          rowHref={(i) => ({ to: "/products/imports/$importId", params: { importId: i.importId } })}
          empty={{ icon: FileSpreadsheet, title: "No imports yet" }}
          toolbar={
            <>
              <Facet
                label="Shop"
                anyLabel="All shops"
                value={historyState.view.filters.shopId ?? null}
                onChange={(v) => historyState.setFilter("shopId", v ?? undefined)}
                options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
              <Facet
                label="State"
                value={historyState.view.filters.state ?? null}
                onChange={(v) => historyState.setFilter("state", v ?? undefined)}
                options={IMPORT_STATES.map((st) => ({ value: st, label: PRODUCT_IMPORT_STATE_WORDS[st] }))}
              />
              <SearchBox label="Search imports" placeholder="File name" value={historyState.draftQ} onChange={historyState.setQ} />
            </>
          }
        />
      </Panel>
    </>
  )
}

const RESULT: Record<ProductImportProductDTO["result"], { word: string; tone: StatusTone }> = {
  pending: { word: "Checking", tone: "moving" },
  ready: { word: "Ready", tone: "done" },
  not_ready: { word: "Not ready", tone: "problem" },
  created: { word: "Created", tone: "done" },
  left_out: { word: "Left out", tone: "muted" },
}

/** One import: products grouped by whether they can be created, each problem named (102). */
export function ImportScreen({ importId }: { importId: string }) {
  useHeaderBack({ label: "Imports", link: { to: "/products/imports" } } as never)
  const imp = useQuery(importQuery(importId))
  if (imp.isError) return <ErrorState error={imp.error} onRetry={() => void imp.refetch()} />
  if (imp.isPending) return <Skeleton className="h-60" />
  return <Import key={imp.data.version} i={imp.data} />
}

function Import({ i }: { i: ProductImportDTO }) {
  const queryClient = useQueryClient()
  const canManage = canManageProducts(useSessionRoles())
  const [error, setError] = useState<string | null>(null)
  const go = useMutation({
    mutationFn: () => createImport(i.importId, i.version),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: productKeys.all }),
    onError: (err) => {
      setError(productErrorText(err))
      void queryClient.invalidateQueries({ queryKey: productKeys.import(i.importId) })
    },
  })
  const notReady = i.products.filter((p) => p.result === "not_ready" || p.result === "left_out")
  const ready = i.products.filter((p) => p.result === "ready" || p.result === "created" || p.result === "pending")

  return (
    <>
      <PageHeader
        title={
          <>
            {i.fileName}
            <StatusWord tone={STATE_TONE[i.state]}>{PRODUCT_IMPORT_STATE_WORDS[i.state]}</StatusWord>
          </>
        }
        meta={
          <>
            <span>{i.shop.name}</span>
            <span>{i.margin.kind === "percent" ? `${i.margin.value}%` : `+ ${i.margin.value}`} margin</span>
            <span>
              {i.counts.rows} rows · {moment(i.createdAt)}
              {i.createdBy ? ` · ${i.createdBy}` : ""}
            </span>
          </>
        }
        actions={
          canManage && i.state === "checked" ? (
            <Button disabled={go.isPending || i.counts.ready === 0} onClick={() => go.mutate()}>
              {go.isPending ? "Asking…" : `Create ${ready.length} ${ready.length === 1 ? "product" : "products"}`}
            </Button>
          ) : undefined
        }
      />

      {i.repeatOf ? (
        <Callout tone="info" title="This file was imported for this shop before">
          On {moment(i.repeatOf.createdAt)}.{" "}
          <Link to="/products/imports/$importId" params={{ importId: i.repeatOf.importId }} className="link">
            Open that import
          </Link>
          . Rows whose SKU already exists are not ready, so nothing is created twice.
        </Callout>
      ) : null}
      {i.state === "checking" || i.state === "creating" ? (
        <Callout tone="info" title={i.state === "checking" ? "Checking every row…" : "Creating the ready products…"}>
          This page updates by itself when it is done.
        </Callout>
      ) : null}
      {i.state === "failed" ? (
        <Callout tone="destructive" title="This import could not finish" role="alert">
          Something failed while it ran — not a row. The team has been alerted; you can upload the list again.
        </Callout>
      ) : null}
      {i.state === "done" ? (
        <Callout
          tone="info"
          title={`${i.counts.created} created${i.counts.leftOut ? `, ${i.counts.leftOut} rows left out` : ""}`}
        >
          Products without a main picture wait for Effy to finish them; the rest are on sale.
        </Callout>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      ) : null}

      {notReady.length > 0 ? (
        <Panel
          title={i.state === "done" ? "Left out" : "Not ready"}
          icon={<CircleAlert aria-hidden="true" />}
          description="Fix these in the file and upload it again — rows already created are recognised by their SKU."
          flush
        >
          <ProductTable products={notReady} />
        </Panel>
      ) : null}
      <Panel title={i.state === "done" ? "Created" : "Ready"} icon={<CircleCheck aria-hidden="true" />} flush>
        {ready.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">None.</p>
        ) : (
          <ProductTable products={ready} />
        )}
      </Panel>
    </>
  )
}

function ProductTable({ products }: { products: readonly ProductImportProductDTO[] }) {
  return (
    <div className="min-w-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Pictures</TableHead>
            <TableHead>What is wrong</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => {
            const problems = p.rows.flatMap((r) => r.problems.map((x) => ({ row: r.rowNumber, ...x })))
            return (
              <TableRow key={p.key} className="align-top">
                <TableCell>
                  {p.productId ? (
                    <Link to="/products/$productId" params={{ productId: p.productId }} className="link">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                  <div className="mt-1">
                    <StatusWord tone={RESULT[p.result].tone}>{RESULT[p.result].word}</StatusWord>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{p.rows.map((r) => r.rowNumber).join(", ")}</TableCell>
                <TableCell className="tabular-nums">{p.pictures}</TableCell>
                <TableCell>
                  {problems.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {problems.map((x, n) => (
                        <li key={n}>
                          Row {x.row}
                          {x.column ? `, ${x.column}` : ""}: {x.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
