import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import {
  BLOCK_CATALOGUE,
  BLOCK_TYPES,
  type BlockType,
  type LayoutBody,
  MAX_BLOCKS_PER_LAYOUT,
} from "@effy/shared-types";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { config } from "@/lib/env";

import { canComposeHome } from "./access";
import { BlockForm } from "./components/BlockForm";
import { BlockList } from "./components/BlockList";
import {
  addFromPreset,
  isAtBlockCeiling,
  isDirty,
  moveDown,
  moveUp,
  newBlockId,
  removeBlock,
  setHidden,
  updateProps,
} from "./model";
import { mintPreview } from "./repo";
import { homeLayoutQuery, usePublish, useRevert, useSaveDraft } from "./queries";

/**
 * The Home Composer (042 US1) — the storefront's home page as an ordered list of blocks.
 *
 * ⚠ THE DRAFT IS HELD IN LOCAL STATE WHILE BEING EDITED, and this is the one place in the app where
 * that is correct rather than a violation of "server state lives in the query cache". Reordering is a
 * sequence of small moves the operator makes and then decides about; writing each one to the server
 * would mean a request per keystroke-equivalent, and — worse — every write bumps the revision, so an
 * operator who moved a block four times and then wanted to abandon the change would have four
 * committed drafts to unpick. The cache remains authoritative for what the SERVER holds; this state
 * is the operator's uncommitted intent, which the server has never been told about.
 */
export function HomeComposerScreen() {
  const { data: session } = useQuery(sessionQuery);
  const layout = useQuery(homeLayoutQuery());
  const saveDraft = useSaveDraft();
  const publish = usePublish();
  const revert = useRevert();

  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canEdit = canComposeHome(roles);

  const [draft, setDraft] = useState<LayoutBody | null>(null);
  const [addType, setAddType] = useState<BlockType>(BLOCK_TYPES[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * ⚠ THE SERVER'S DRAFT SEEDS THE LOCAL ONE, AND ONLY WHEN THERE IS NO LOCAL WORK TO LOSE. Re-seeding
   * on every refetch would silently discard whatever the operator had moved since the last save —
   * TanStack refetches on window focus, so alt-tabbing to check something would erase their work.
   */
  useEffect(() => {
    if (layout.data && draft === null) setDraft(layout.data.draft);
  }, [layout.data, draft]);

  if (layout.isPending) {
    return <p className="py-10 text-sm text-muted-foreground">Loading the home page&hellip;</p>;
  }
  if (layout.isError || !layout.data || draft === null) {
    return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  }

  const { revision, published } = layout.data;
  const dirty = isDirty(draft, layout.data.draft);
  const draftDiffersFromLive = isDirty(draft, published);
  const atCeiling = isAtBlockCeiling(draft);

  const mutate = (next: LayoutBody) => {
    setDraft(next);
    track({ name: "home_layout_edited", blocks: next.length });
  };

  const onSave = async () => {
    await saveDraft.mutateAsync({ blocks: draft, revision });
    // ⚠ Cleared so the next render re-seeds from the server's answer. The server is authoritative
    // for what was actually stored, and keeping local state after a save is how a screen starts
    // showing something the platform never accepted.
    setDraft(null);
  };

  /**
   * ⚠ A NEW TAB, NOT AN IFRAME (research R5). The storefront is a different origin, so an embedded
   * preview would need a third-party cookie to carry the draft session — and Safari blocks those by
   * default. It would work on a developer's machine and fail for the operator, which is the worst
   * possible place for that difference to show up.
   *
   * ⚠ The tab is opened BEFORE the await, and navigated after. A `window.open` that follows an async
   * call is not a user gesture any more, and every browser's popup blocker stops it — the operator
   * would click Preview and watch nothing happen.
   */
  const onPreview = async () => {
    const base = config.storefrontBaseUrl();
    if (!base) return;

    const tab = window.open("", "_blank", "noopener");
    try {
      const { token } = await mintPreview();
      const url = `${base.replace(/\/$/, "")}/api/preview?token=${encodeURIComponent(token)}`;
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener");
      track({ name: "home_layout_previewed" });
    } catch {
      // The tab is already open and blank; closing it beats leaving the operator staring at one.
      tab?.close();
    }
  };

  const onPublish = async () => {
    await publish.mutateAsync({ revision });
    setDraft(null);
    track({ name: "home_layout_published", blocks: draft.length });
  };

  const onRevert = async () => {
    await revert.mutateAsync({ revision });
    setDraft(null);
    track({ name: "home_layout_reverted" });
  };

  const busy = saveDraft.isPending || publish.isPending || revert.isPending;
  // ⚠ Looked up from the DRAFT on every render rather than held in state. Holding the block itself
  // would mean editing a stale copy the moment anything else changed the list — a move, a hide, a
  // save — and the operator's next keystroke would resurrect the version they were looking at.
  const selected = draft.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Home page</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The storefront&rsquo;s home page, top to bottom. Changes are saved as a draft and shown to
            shoppers only when you publish.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSave} disabled={!dirty || busy}>
              Save draft
            </Button>
            {/* ⚠ Only when the storefront's address is configured. A control that opens a blank tab
                is worse than one that is not there. */}
            {config.storefrontBaseUrl() && (
              <Button variant="outline" onClick={onPreview} disabled={busy}>
                Preview
              </Button>
            )}
            {/* ⚠ "Discard changes", NOT "undo publish" — and the label has to say so. With two bodies
                and no history there is nothing behind `published` to return to, and an operator who
                learns that at the moment they need the other behaviour learns it too late. */}
            <Button variant="outline" onClick={onRevert} disabled={busy}>
              Discard changes
            </Button>
            <Button onClick={onPublish} disabled={!draftDiffersFromLive || busy}>
              Publish
            </Button>
          </div>
        )}
      </div>

      {/* ⚠ The unsaved-work state is STATED, not implied by an enabled button. */}
      {dirty && (
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. Save the draft to keep them, or discard to return to what is live.
        </p>
      )}

      {(saveDraft.error || publish.error || revert.error) && (
        // ⚠ The server's own message reaches the operator through ErrorState, which maps a
        // problem+json detail to copy. Every refusal in this slice is written to be READ — "someone
        // else changed the layout since you loaded it", "published, but the storefront did not accept
        // the refresh" — and substituting a generic string here would discard the useful half.
        <ErrorState error={saveDraft.error ?? publish.error ?? revert.error} />
      )}

      {/*
        ⚠ TWO COLUMNS, LIST AND EDITOR — not a dialog per block. The operator's two questions here are
        "what is on the page, in what order" and "what does this one say", and a modal answers the
        second by hiding the first. It also makes the sequence of small edits this screen is built
        around — open, change a word, close, open the next — cost two extra actions each time.
      */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <BlockList
          body={draft}
          canEdit={canEdit}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMoveUp={(i) => mutate(moveUp(draft, i))}
          onMoveDown={(i) => mutate(moveDown(draft, i))}
          onToggleHidden={(id, hidden) => mutate(setHidden(draft, id, hidden))}
          onRemove={(id) => {
            // ⚠ Clear the selection when the selected block goes, or the editor keeps rendering a
            // block that is no longer in the layout — and every keystroke in it is silently discarded.
            if (id === selectedId) setSelectedId(null);
            mutate(removeBlock(draft, id));
          }}
        />

        <div className="min-w-0">
          {selected ? (
            <>
              <h2 className="mb-4 text-lg font-semibold">
                {BLOCK_CATALOGUE[selected.type as BlockType]?.label ?? selected.type}
              </h2>
              <BlockForm
                block={selected}
                disabled={!canEdit || busy}
                onChange={(props) => mutate(updateProps(draft, selected.id, props))}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a block on the left to edit what it says.
            </p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={addType} onValueChange={(v) => setAddType(v as BlockType)}>
            <SelectTrigger className="w-64" aria-label="Block to add">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {BLOCK_CATALOGUE[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={atCeiling}
            onClick={() =>
              mutate(
                addFromPreset(draft, addType, BLOCK_CATALOGUE[addType].presets[0]!.name, newBlockId),
              )
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Add block
          </Button>
          {/* ⚠ The ceiling is SURFACED, not merely enforced (FR-009). A disabled button with no
              explanation reads as a broken tool; the server refuses regardless, so the only question
              is whether the operator finds out before or after they try. */}
          {atCeiling && (
            <p className="text-sm text-muted-foreground">
              A layout can hold {MAX_BLOCKS_PER_LAYOUT} blocks. Remove one to add another.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
