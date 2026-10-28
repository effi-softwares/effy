import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Copy, Trash2 } from "lucide-react"

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
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
} from "@effy/design-system/ui"
import {
  AUTO,
  BUTTON_STYLES,
  CHIP_STYLES,
  DECORATION_SETS,
  DESIGNED_LAYOUTS,
  LAYOUT_FITS,
  LAYOUT_SHOWS_PICTURE,
  RADII,
  skinContrast,
  SPACINGS,
  starterSettings,
  TEXT_CORNERS,
  validateSkin,
  wordsOverPicture,
  type AdminSkinDTO,
  type DesignedLayout,
  type SkinSettings,
} from "@effy/shared-types"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import { Callout, PageHeader, Panel } from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { canManagePromotions } from "@/features/promotions/access"
import { inUseError, promotionMutationError } from "@/features/promotions/errorText"
import { track } from "@/lib/telemetry"

import { promotionSkinQuery, useCreateSkin, useDeleteSkin, useUpdateSkin } from "./queries"
import { DuplicateSkinDialog } from "./DuplicateSkinDialog"
import { ReadabilityPanel } from "./ReadabilityPanel"
import { relayout } from "./relayout"
import { ColourField, Choice, Strength, TextStyleFields, Toggle } from "./SkinFields"
import { LAYOUT_WORD, SIZE_WORD, SkinPreview } from "./SkinPreview"
import { SkinUsage } from "./SkinUsage"

export function SkinEditorScreen({ skinId }: { skinId?: string }) {
  const skin = useQuery({ ...promotionSkinQuery(skinId ?? ""), enabled: Boolean(skinId) })
  useHeaderDetail(skin.data?.name ?? (skinId ? null : "New skin"))
  if (!skinId) return <Editor current={null} />
  if (skin.isError) return <ErrorState error={skin.error} onRetry={() => void skin.refetch()} />
  if (!skin.data) return <Skeleton className="h-96" aria-busy="true" />
  if (skin.data.builtIn) return <ClassicScreen skin={skin.data} />
  return <Editor key={skin.data.version} current={skin.data} />
}

function ClassicScreen({ skin }: { skin: AdminSkinDTO }) {
  return (
    <>
      <PageHeader
        back={{ label: "Skins", link: { to: "/promotions/skins" } }}
        title={skin.name}
        description="The built-in look, where the website and app choose the colours and icons."
      />
      <SkinUsage skin={skin} />
    </>
  )
}

function Editor({ current }: { current: AdminSkinDTO | null }) {
  const canManage = canManagePromotions(useSessionRoles())
  const navigate = useNavigate()
  const create = useCreateSkin()
  const update = useUpdateSkin(current?.id ?? "")
  const remove = useDeleteSkin()
  const [name, setName] = useState(current?.name ?? "")
  const [layout, setLayout] = useState<DesignedLayout>((current?.layout as DesignedLayout) ?? "panel")
  const [s, setS] = useState<SkinSettings>(current?.settings ?? starterSettings("panel"))
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  const issues = useMemo(() => validateSkin(layout, s), [layout, s])
  const pairs = useMemo(() => (issues.length ? [] : skinContrast(layout, s)), [issues, layout, s])
  const failing = pairs.filter((p) => !p.ok)
  const nameOk = name.trim().length >= 1 && name.trim().length <= 60
  const saveable = canManage && nameOk && issues.length === 0 && failing.length === 0
  const pending = create.isPending || update.isPending
  const showsPicture = LAYOUT_SHOWS_PICTURE[layout] === "required" || s.background.picture === "show"

  const patch = <K extends keyof SkinSettings>(k: K, v: SkinSettings[K]) => setS((prev) => ({ ...prev, [k]: v }))

  function save() {
    setError(null)
    const onError = (e: unknown) => setError(promotionMutationError(e))
    if (!current) {
      create.mutate(
        { name: name.trim(), layout, settings: s },
        {
          onSuccess: (saved) => {
            track({ name: "promotion_skin_saved", skinId: saved.id, layout, created: true })
            void navigate({ to: "/promotions/skins/$skinId", params: { skinId: saved.id } })
          },
          onError,
        },
      )
    } else {
      update.mutate(
        { name: name.trim(), layout, settings: s, expectedVersion: current.version },
        {
          onSuccess: (saved) => track({ name: "promotion_skin_saved", skinId: saved.id, layout, created: false }),
          onError,
        },
      )
    }
  }

  const inUse = (current?.usageCount ?? 0) > 0

  return (
    <>
      <PageHeader
        back={{ label: "Skins", link: { to: "/promotions/skins" } }}
        title={current ? current.name : "New skin"}
        description="Pick a layout and set its colours, text and pictures for how promotions look."
        actions={
          canManage ? (
            <>
              {current ? (
                <>
                  <Button variant="outline" onClick={() => setDuplicating(true)}>
                    <Copy aria-hidden="true" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={inUse}
                    title={inUse ? "In use — choose another skin where it is used first" : undefined}
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </>
              ) : null}
              <Button disabled={!saveable || pending} onClick={() => (inUse ? setConfirming(true) : save())}>
                {pending ? "Saving…" : current ? "Save skin" : "Create skin"}
              </Button>
            </>
          ) : undefined
        }
      />
      {error ? (
        <Callout tone="destructive" title="That didn't work">
          {error}
        </Callout>
      ) : null}

      <div className="ef-detail">
        <fieldset className="ef-detail__main min-w-0 space-y-4" disabled={!canManage}>
          <Panel title="Name and layout">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skin-name">Name</Label>
                <Input
                  id="skin-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Winter — photo"
                  className="max-w-md"
                />
                <p className="mt-0.5 block text-sm text-muted-foreground">
                  For staff only. Pick it by this name when placing a promotion.
                </p>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Layout</span>
                <RadioGroup
                  aria-label="Layout"
                  className="grid gap-2 sm:grid-cols-3"
                  value={layout}
                  onValueChange={(v) => {
                    const l = v as typeof layout
                    if (l === layout) return
                    setLayout(l)
                    setS((prev) => relayout(prev, l))
                  }}
                >
                  {DESIGNED_LAYOUTS.map((l) => (
                    <Label
                      key={l}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm font-normal transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-muted/40"
                    >
                      <RadioGroupItem value={l} className="mt-0.5" />
                      <span className="grid gap-1">
                        <span className="font-medium">{LAYOUT_WORD[l]}</span>
                        <span className="text-muted-foreground">
                          Fits {LAYOUT_FITS[l].map((z) => SIZE_WORD[z].toLowerCase()).join(",")} places
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </Panel>

          <Panel title="Background">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColourField
                id="bg"
                label="Colour"
                hint="Shown under the picture while it loads, and when there is none."
                value={s.background.colour}
                onChange={(c) => patch("background", { ...s.background, colour: c })}
              />
              {LAYOUT_SHOWS_PICTURE[layout] === "optional" ? (
                <Toggle
                  id="bg-picture"
                  label="Show the promotion's picture"
                  checked={s.background.picture === "show"}
                  onChange={(on) =>
                    patch("background", {
                      ...s.background,
                      picture: on ? "show" : "none",
                      ...(on && wordsOverPicture(layout) && !s.background.tint
                        ? { tint: { colour: "#000000", strength: 0.5 } }
                        : {}),
                    })
                  }
                />
              ) : (
                <p className="mt-0.5 block text-sm text-muted-foreground self-center">
                  This layout always shows the promotion's picture when it has one.
                </p>
              )}
              {showsPicture && wordsOverPicture(layout) ? (
                <>
                  <ColourField
                    id="tint"
                    label="Tint over the picture"
                    value={s.background.tint?.colour ?? "#000000"}
                    onChange={(c) =>
                      patch("background", {
                        ...s.background,
                        tint: { colour: c, strength: s.background.tint?.strength ?? 0.5 },
                      })
                    }
                  />
                  <Strength
                    id="tint-strength"
                    label="Tint strength"
                    max={0.9}
                    value={s.background.tint?.strength ?? 0.5}
                    onChange={(v) =>
                      patch("background", {
                        ...s.background,
                        tint: { colour: s.background.tint?.colour ?? "#000000", strength: v },
                      })
                    }
                  />
                </>
              ) : null}
              {layout === "header_card" ? (
                <>
                  <ColourField
                    id="body"
                    label="Card body"
                    value={s.body?.colour ?? "#ffffff"}
                    onChange={(c) => patch("body", { colour: c, tagColour: s.body?.tagColour ?? "#18181b" })}
                  />
                  <ColourField
                    id="tag"
                    label="Code tag"
                    value={s.body?.tagColour ?? "#18181b"}
                    onChange={(c) => patch("body", { colour: s.body?.colour ?? "#ffffff", tagColour: c })}
                  />
                </>
              ) : null}
              {layout === "full_picture" ? (
                <Choice
                  id="corner"
                  label="Where the words sit"
                  value={s.textCorner ?? "bottom-start"}
                  options={TEXT_CORNERS}
                  words={{
                    "top-start": "Top left",
                    "bottom-start": "Bottom left",
                    center: "Centre",
                    "bottom-end": "Bottom right",
                  }}
                  onChange={(v) => patch("textCorner", v)}
                />
              ) : null}
              {layout === "picture_beside" ? (
                <>
                  <Choice
                    id="side"
                    label="Picture side"
                    value={s.pictureSide ?? "end"}
                    options={["start", "end"] as const}
                    words={{ start: "Left", end: "Right" }}
                    onChange={(v) => patch("pictureSide", v)}
                  />
                  <Choice
                    id="fit"
                    label="Picture fills"
                    value={s.pictureFit ?? "cover"}
                    options={["cover", "contain"] as const}
                    words={{ cover: "The whole half (crops)", contain: "As much as fits (no crop)" }}
                    onChange={(v) => patch("pictureFit", v)}
                  />
                </>
              ) : null}
            </div>
          </Panel>

          <Panel title="Words">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle
                  id="label-show"
                  label="Small label above the headline"
                  checked={s.label.show}
                  onChange={(on) => patch("label", { ...s.label, show: on })}
                />
                {s.label.show ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="label-words">Label words</Label>
                      <Input
                        id="label-words"
                        value={s.label.words === AUTO ? "" : s.label.words}
                        placeholder="Code / Offer (automatic)"
                        maxLength={16}
                        onChange={(e) =>
                          patch("label", { ...s.label, words: e.target.value.trim() ? e.target.value : AUTO })
                        }
                      />
                    </div>
                    <ColourField
                      id="label-colour"
                      label="Label colour"
                      value={s.label.colour}
                      onChange={(c) => patch("label", { ...s.label, colour: c })}
                    />
                    <Choice
                      id="label-size"
                      label="Label size"
                      value={s.label.size}
                      options={["xs", "sm"] as const}
                      words={{ xs: "Extra small", sm: "Small" }}
                      onChange={(v) => patch("label", { ...s.label, size: v })}
                    />
                  </>
                ) : null}
              </div>
              <TextStyleFields
                id="headline"
                title="Headline"
                style={s.headline}
                maxLines={layout === "strip" ? 1 : 3}
                onChange={(v) => patch("headline", v)}
              />
              {layout !== "tile" && layout !== "strip" ? (
                <div className="space-y-3">
                  <Toggle
                    id="sub-show"
                    label="Supporting line"
                    checked={s.supporting.show}
                    onChange={(on) => patch("supporting", { ...s.supporting, show: on })}
                  />
                  {s.supporting.show ? (
                    <TextStyleFields
                      id="supporting"
                      title="Supporting line"
                      style={s.supporting}
                      maxLines={3}
                      onChange={(v) => patch("supporting", { ...s.supporting, ...v })}
                    />
                  ) : null}
                </div>
              ) : null}
              <Choice
                id="align"
                label="Alignment"
                value={s.align}
                options={["start", "center", "end"] as const}
                words={{ start: "Left", center: "Centre", end: "Right" }}
                onChange={(v) => patch("align", v)}
              />
            </div>
          </Panel>

          <Panel title="Button and code">
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice
                id="btn-style"
                label="Button"
                value={s.button.style}
                options={BUTTON_STYLES}
                words={{ filled: "Filled", outline: "Outline", link: "Text link", none: "No button" }}
                onChange={(v) => patch("button", { ...s.button, style: v })}
              />
              {s.button.style !== "none" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="btn-words">Button words</Label>
                    <Input
                      id="btn-words"
                      value={s.button.words === AUTO ? "" : s.button.words}
                      placeholder="Copy code / View offer (automatic)"
                      maxLength={24}
                      onChange={(e) =>
                        patch("button", { ...s.button, words: e.target.value.trim() ? e.target.value : AUTO })
                      }
                    />
                    <p className="mt-0.5 block text-sm text-muted-foreground">
                      With a code the button copies it; without one it opens the offer.
                    </p>
                  </div>
                  {s.button.style === "filled" ? (
                    <ColourField
                      id="btn-fill"
                      label="Button colour"
                      value={s.button.fill}
                      onChange={(c) => patch("button", { ...s.button, fill: c })}
                    />
                  ) : null}
                  <ColourField
                    id="btn-text"
                    label="Button words colour"
                    value={s.button.text}
                    onChange={(c) => patch("button", { ...s.button, text: c })}
                  />
                  <Toggle
                    id="btn-icon"
                    label="Icon on the button"
                    checked={s.button.icon}
                    onChange={(on) => patch("button", { ...s.button, icon: on })}
                  />
                </>
              ) : null}
              <Toggle
                id="chip-show"
                label="Show the code in a chip"
                checked={s.chip.show}
                onChange={(on) => patch("chip", { ...s.chip, show: on })}
              />
              {s.chip.show ? (
                <>
                  <Choice
                    id="chip-style"
                    label="Chip"
                    value={s.chip.style}
                    options={CHIP_STYLES}
                    words={{ dashed: "Dashed outline", solid: "Solid outline", filled: "Filled" }}
                    onChange={(v) => patch("chip", { ...s.chip, style: v })}
                  />
                  {s.chip.style === "filled" ? (
                    <ColourField
                      id="chip-fill"
                      label="Chip colour"
                      value={s.chip.fill}
                      onChange={(c) => patch("chip", { ...s.chip, fill: c })}
                    />
                  ) : null}
                  <ColourField
                    id="chip-text"
                    label="Code colour"
                    value={s.chip.text}
                    onChange={(c) => patch("chip", { ...s.chip, text: c })}
                  />
                </>
              ) : null}
            </div>
          </Panel>

          <Panel title="Decorations and shape" description="Decorations are drawn when there is no picture.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle
                id="decor-show"
                label="Decorations"
                checked={s.decorations.show}
                onChange={(on) => patch("decorations", { ...s.decorations, show: on })}
              />
              {s.decorations.show ? (
                <>
                  <Choice
                    id="decor-set"
                    label="Icons"
                    value={s.decorations.set}
                    options={DECORATION_SETS}
                    words={{
                      food: "Food",
                      produce: "Fruit and veg",
                      bakery: "Bakery",
                      drinks: "Drinks",
                      "seasonal-winter": "Winter",
                      "seasonal-summer": "Summer",
                      celebration: "Celebration",
                    }}
                    onChange={(v) => patch("decorations", { ...s.decorations, set: v })}
                  />
                  <ColourField
                    id="decor-colour"
                    label="Decoration colour"
                    value={s.decorations.colour}
                    onChange={(c) => patch("decorations", { ...s.decorations, colour: c })}
                  />
                  <Strength
                    id="decor-strength"
                    label="Decoration strength"
                    max={1}
                    value={s.decorations.strength}
                    onChange={(v) => patch("decorations", { ...s.decorations, strength: v })}
                  />
                </>
              ) : null}
              <Choice
                id="radius"
                label="Corners"
                value={s.shape.radius}
                options={RADII}
                words={{ none: "Square", sm: "Slightly round", md: "Round", lg: "Rounder", xl: "Roundest" }}
                onChange={(v) => patch("shape", { ...s.shape, radius: v })}
              />
              <Choice
                id="spacing"
                label="Inner space"
                value={s.shape.spacing}
                options={SPACINGS}
                words={{ compact: "Compact", regular: "Regular", roomy: "Roomy" }}
                onChange={(v) => patch("shape", { ...s.shape, spacing: v })}
              />
              <Toggle
                id="outline"
                label="Outline"
                checked={s.shape.outline !== null}
                onChange={(on) => patch("shape", { ...s.shape, outline: on ? "#e4e4e7" : null })}
              />
              {s.shape.outline !== null ? (
                <ColourField
                  id="outline-colour"
                  label="Outline colour"
                  value={s.shape.outline}
                  onChange={(c) => patch("shape", { ...s.shape, outline: c })}
                />
              ) : null}
            </div>
          </Panel>

          <Panel
            title="In the app's dark appearance"
            description="Optional. Without its own dark colours, a skin looks the same in both appearances."
          >
            <Toggle
              id="dark"
              label="Use different colours in dark"
              checked={Boolean(s.dark)}
              onChange={(on) =>
                setS((prev) => {
                  if (on)
                    return {
                      ...prev,
                      dark: {
                        background: prev.background,
                        headline: prev.headline,
                        label: prev.label,
                        supporting: prev.supporting,
                      },
                    }
                  const { dark: _dark, ...rest } = prev
                  return rest
                })
              }
            />
            {s.dark ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ColourField
                  id="dark-bg"
                  label="Background"
                  value={s.dark.background?.colour ?? s.background.colour}
                  onChange={(c) =>
                    patch("dark", { ...s.dark, background: { ...(s.dark?.background ?? s.background), colour: c } })
                  }
                />
                <ColourField
                  id="dark-head"
                  label="Headline"
                  value={s.dark.headline?.colour ?? s.headline.colour}
                  onChange={(c) =>
                    patch("dark", { ...s.dark, headline: { ...(s.dark?.headline ?? s.headline), colour: c } })
                  }
                />
                <ColourField
                  id="dark-label"
                  label="Label"
                  value={s.dark.label?.colour ?? s.label.colour}
                  onChange={(c) => patch("dark", { ...s.dark, label: { ...(s.dark?.label ?? s.label), colour: c } })}
                />
                <ColourField
                  id="dark-sub"
                  label="Supporting line"
                  value={s.dark.supporting?.colour ?? s.supporting.colour}
                  onChange={(c) =>
                    patch("dark", { ...s.dark, supporting: { ...(s.dark?.supporting ?? s.supporting), colour: c } })
                  }
                />
              </div>
            ) : null}
          </Panel>
        </fieldset>

        <aside className="ef-detail__aside space-y-4">
          <Panel title="Preview" description="Exactly as the website draws it.">
            <SkinPreview layout={layout} settings={s} />
          </Panel>
          <ReadabilityPanel issues={issues} pairs={pairs} />
          {current ? <SkinUsage skin={current} /> : null}
        </aside>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change every place using this skin?</AlertDialogTitle>
            <AlertDialogDescription>
              {current?.usageCount} {current?.usageCount === 1 ? "place wears" : "places wear"} it. Shoppers see the new
              look there within a minute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={save}>Save everywhere</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {current?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Nothing uses it. It can't be brought back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(current!.id, {
                  onSuccess: () => void navigate({ to: "/promotions/skins" }),
                  onError: (e) => setError(inUseError(e, "skin") ?? promotionMutationError(e)),
                })
              }
            >
              Delete skin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {current ? <DuplicateSkinDialog skin={current} open={duplicating} onOpenChange={setDuplicating} /> : null}
    </>
  )
}
