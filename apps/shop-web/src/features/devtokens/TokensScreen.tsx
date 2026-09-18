import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardHeading,
  CardRow,
  CardTitle,
  CardDescription,
  CardAction,
  Checkbox,
  EmptyState,
  IconChip,
  Input,
  Meter,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Loader,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsCount,
  TabsList,
  TabsTrigger,
  Textarea,
  InitialsAvatar,
} from "@effy/design-system/ui";

/**
 * THE VERIFICATION HARNESS for Phases 1 and 2 of the theme adoption.
 *
 * ⚠ DEV-ONLY, AND NOT A NAV DESTINATION. It is registered in `router.tsx` behind
 * `import.meta.env.DEV` and appears in no sidebar; production never ships the route. It exists so
 * "does every token resolve in both appearances?" and "does every component match the reference in
 * every state?" are questions someone can ANSWER BY LOOKING, on one page, rather than by hunting the
 * states across nine feature screens.
 *
 * ⚠ THIS IS THE ONE FILE ALLOWED TO NAME TOKENS AS STRINGS. Everything else references them through
 * Tailwind utilities. A swatch grid whose labels are hand-written prose would drift from the real
 * token set silently — so the list below IS the contract, and a token missing from tokens.css
 * renders as a visibly blank chip rather than as a passing test.
 */

const SURFACES = [
  "background",
  "foreground",
  "card",
  "muted",
  "muted-foreground",
  "border",
  "input",
  "accent",
  "accent-foreground",
  "secondary",
  "secondary-foreground",
  "sidebar",
  "ring",
] as const;

const BRAND = ["primary", "primary-foreground", "brand", "brand-soft", "brand-mid", "brand-ink"] as const;

const HUES = ["accent2", "accent2-soft", "violet", "violet-soft", "violet-mid", "teal", "teal-soft"] as const;

const STATES = [
  "destructive",
  "destructive-soft",
  "success",
  "success-soft",
  "warning",
  "warning-soft",
  "disabled",
  "disabled-foreground",
  "placeholder",
] as const;

const CHARTS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="size-8 shrink-0 rounded-md border border-border"
        style={{ background: `var(--${name})` }}
      />
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">--{name}</span>
    </div>
  );
}

function Group({ title, names }: { title: string; names: readonly string[] }) {
  return (
    <section className="grid gap-2.5">
      <h3 className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {names.map((n) => (
          <Swatch key={n} name={n} />
        ))}
      </div>
    </section>
  );
}

export function TokensScreen() {
  const [checked, setChecked] = useState(true);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="border-b">
          <IconChip tone="brand" size="lg">
            ◐
          </IconChip>
          <CardHeading>
            <CardTitle>Colour tokens</CardTitle>
            <CardDescription>
              Every token in both appearances. Flip the header toggle to check dark.
            </CardDescription>
          </CardHeading>
        </CardHeader>
        <CardContent className="grid gap-5 pt-4">
          <Group title="Surfaces" names={SURFACES} />
          <Group title="Brand — the one action colour" names={BRAND} />
          <Group title="Bounded hues — attention and data-viz" names={HUES} />
          <Group title="State semantics" names={STATES} />
          <Group title="Charts" names={CHARTS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <IconChip tone="violet" size="lg">
            ◈
          </IconChip>
          <CardHeading>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Every variant, every size, every state.</CardDescription>
          </CardHeading>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="secondary">Filled quiet</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive-ghost">Destructive ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">xs 24</Button>
            <Button size="compact">compact 30</Button>
            <Button size="sm">sm 32</Button>
            <Button>default 34</Button>
            <Button size="lg">lg 40</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled>Disabled primary</Button>
            <Button variant="outline" disabled>
              Disabled secondary
            </Button>
            <Button>
              <Spinner className="border-primary-foreground/40 border-t-primary-foreground" />
              Working
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <IconChip tone="teal" size="lg">
            ▤
          </IconChip>
          <CardHeading>
            <CardTitle>Status pills, chips and avatars</CardTitle>
            <CardDescription>The closed five-tone mapping, plus the tint palette.</CardDescription>
          </CardHeading>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>In progress</Badge>
            <Badge variant="success">Paid</Badge>
            <Badge variant="warning">Awaiting pick</Badge>
            <Badge variant="destructive">Refunded</Badge>
            <Badge variant="muted">Not applicable</Badge>
            <Badge variant="outline">Plain</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["brand", "violet", "teal", "attention", "success", "warning", "destructive", "muted"] as const).map(
              (tone) => (
                <IconChip key={tone} tone={tone} size="md">
                  ◎
                </IconChip>
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["Maya Karlsson", "Nils Ahlberg", "Sofia Ruus", "Amina Osei", "Klas Berg"].map((n) => (
              <InitialsAvatar key={n} name={n} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <IconChip tone="attention" size="lg">
            ◫
          </IconChip>
          <CardHeading>
            <CardTitle>Form controls</CardTitle>
            <CardDescription>Rest, focus, error and disabled.</CardDescription>
          </CardHeading>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-medium">Label</label>
            <Input placeholder="Placeholder text" />
            <span className="text-[12.5px] text-muted-foreground">Helper text sits here.</span>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-medium">With an error</label>
            <Input aria-invalid defaultValue="Not valid" />
            <span className="text-[12px] text-destructive">This field needs a value.</span>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-medium">Select</label>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">First option</SelectItem>
                <SelectItem value="b">Second option</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[12.5px] font-medium">Disabled</label>
            <Input disabled defaultValue="Unavailable" />
          </div>
          <Textarea placeholder="Textarea" className="sm:col-span-2" />
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            Selection checkbox
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardHeading>
            <CardTitle>Tabs, progress and loading</CardTitle>
            <CardDescription>The segmented control and every in-flight affordance.</CardDescription>
          </CardHeading>
          <CardAction>
            <Spinner />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                All <TabsCount>42</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="open">
                Awaiting <TabsCount>8</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="done">
                Done <TabsCount>34</TabsCount>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Progress value={62} tone="brand" label="Picked" />
          <Meter
            segments={[
              { label: "Picked", value: 24, tone: "success" },
              { label: "Awaiting", value: 8, tone: "warning" },
              { label: "Unavailable", value: 2, tone: "destructive" },
            ]}
          />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          {/* Skeleton for small things (a line, a figure); the orbit loader for regions. */}
          <div className="flex items-end gap-8">
            <Loader size={44} />
            <Loader size={56} />
            <Loader size={72} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardHeading>
            <CardTitle>Table</CardTitle>
            <CardDescription>Micro-label heads, mono identifiers, right-aligned amounts.</CardDescription>
          </CardHeading>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead numeric>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { n: "Johanna Lind", r: "ORD-4417", s: "warning" as const, l: "Awaiting pick", t: "1 147" },
              { n: "Ellen Brandt", r: "ORD-4416", s: "brand" as const, l: "Packed", t: "796" },
              { n: "Nils Ahlberg", r: "ORD-4415", s: "success" as const, l: "Shipped", t: "1 490" },
            ].map((row) => (
              <TableRow key={row.r}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <InitialsAvatar name={row.n} className="size-6" />
                    {row.n}
                  </span>
                </TableCell>
                <TableCell mono>{row.r}</TableCell>
                <TableCell>
                  <Badge variant={row.s}>{row.l}</Badge>
                </TableCell>
                <TableCell numeric>{row.t}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <EmptyState
        title="Nothing to show here"
        description="This is the empty state: it says what happened and offers one way out."
        action={<Button variant="outline">Clear filters</Button>}
      />
    </div>
  );
}
