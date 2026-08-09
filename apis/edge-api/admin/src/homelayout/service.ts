// Service layer for the home layout (042) — validation, orchestration and the storefront's cache.
// No HTTP, no SQL (Principle VI).
//
// ⚠ THE VALIDATION HERE IS THE ONLY VALIDATION THERE IS (FR-032). The composer's form checks the same
// rules for the operator's benefit, but the operator can reach this API directly and the storefront
// has to live with whatever ends up in the column. A rule that exists only in a form is not a rule.
import {
  BLOCK_TYPES,
  type BlockType,
  MAX_BLOCKS_PER_LAYOUT,
  blockDefinition,
} from "@effy/shared-types";

import * as repo from "./repository";
import { revalidateStorefront } from "./revalidate";
import {
  type HomeLayout,
  type LayoutBlock,
  type LayoutBody,
  LayoutError,
  type LayoutIssue,
} from "./types";

export async function getLayout(): Promise<HomeLayout> {
  const layout = await repo.readLayout();
  if (!layout) {
    // ⚠ 503, not 404. The row is seeded by the migration, so its absence is an unapplied migration —
    // an operator who is told "not found" will go looking for a layout to create, which is not the
    // problem and not something they can fix.
    throw new LayoutError(503, "layout_unavailable", "the home layout is not initialised on this environment");
  }
  return layout;
}

export async function saveDraft(
  body: unknown,
  revision: number,
  actorSub: string,
): Promise<HomeLayout> {
  const parsed = parseBody(body);
  // ⚠ STRUCTURAL VALIDATION ON SAVE, FULL VALIDATION ON PUBLISH. A draft is work in progress: an
  // operator who has added a tile and not yet written its headline must be able to save and come
  // back. What a draft may never be is un-parseable — that would corrupt the composer itself.
  assertNoDuplicateIds(parsed);
  assertWithinBlockCap(parsed);
  return repo.writeDraft(parsed, revision, actorSub);
}

export async function publish(revision: number, actorSub: string): Promise<HomeLayout> {
  const current = await getLayout();
  const issues = validateForPublish(current.draft);
  if (issues.length > 0) {
    throw new LayoutError(
      422,
      "layout_invalid",
      "this layout cannot be published yet — fix the problems listed and try again",
      issues,
    );
  }
  const saved = await repo.publish(revision, actorSub);
  await revalidateStorefront();
  return saved;
}

export async function revert(revision: number, actorSub: string): Promise<HomeLayout> {
  const saved = await repo.revert(revision, actorSub);
  // ⚠ A revert changes the DRAFT only, so shoppers see nothing new and the cache is already correct.
  // Invalidating anyway is deliberate: it costs one round trip on a rare operator action, and it
  // means the one code path that could ever leave the storefront stale does not depend on this
  // reasoning staying true if revert's semantics ever change.
  await revalidateStorefront();
  return saved;
}

export async function getAudit(limit?: number): Promise<repo.AuditEntry[]> {
  return repo.readAudit(limit ?? 50);
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

/** Parse an untrusted body into a layout, refusing anything that is not the agreed shape. */
function parseBody(body: unknown): LayoutBody {
  if (!Array.isArray(body)) {
    throw new LayoutError(400, "layout_not_an_array", "a layout is an ordered array of blocks");
  }
  return body.map((raw, i) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new LayoutError(400, "block_not_an_object", `block ${i} is not an object`);
    }
    const b = raw as Record<string, unknown>;
    if (typeof b.id !== "string" || b.id.trim() === "") {
      throw new LayoutError(400, "block_missing_id", `block ${i} has no id`);
    }
    if (typeof b.type !== "string") {
      throw new LayoutError(400, "block_missing_type", `block ${b.id} has no type`);
    }
    if (b.props !== undefined && (typeof b.props !== "object" || b.props === null || Array.isArray(b.props))) {
      throw new LayoutError(400, "block_props_not_an_object", `block ${b.id} has malformed props`);
    }
    const block: LayoutBlock = {
      id: b.id,
      type: b.type,
      props: (b.props as Record<string, unknown>) ?? {},
    };
    if (b.hidden === true) block.hidden = true;
    return block;
  });
}

/**
 * ⚠ A DUPLICATE ID IS NOT COSMETIC. The id is what makes a reorder a reorder rather than a
 * delete-plus-create — it is the React key in the composer, the anchor an audit entry points at, and
 * what a move operation identifies. Two blocks sharing one would make the composer reorder the wrong
 * block, and it would look like a UI bug for as long as anyone cared to investigate.
 */
function assertNoDuplicateIds(body: LayoutBody): void {
  const seen = new Set<string>();
  for (const b of body) {
    if (seen.has(b.id)) {
      throw new LayoutError(400, "block_duplicate_id", `two blocks share the id ${b.id}`);
    }
    seen.add(b.id);
  }
}

function assertWithinBlockCap(body: LayoutBody): void {
  if (body.length > MAX_BLOCKS_PER_LAYOUT) {
    throw new LayoutError(
      422,
      "layout_too_many_blocks",
      `a layout may hold at most ${MAX_BLOCKS_PER_LAYOUT} blocks; this one has ${body.length}`,
    );
  }
}

/**
 * The publish-time rules that do not need to reach outside the layout.
 *
 * ⚠ THIS IS NOT THE WHOLE OF FR-032. Reference existence, artwork conformance and heading order are
 * US4's work and are added here rather than in a second validator — one entry point, so a rule cannot
 * be enforced on one route and not another. What is here today is deliberately the subset that needs
 * nothing but the block and its catalogue definition.
 */
function validateForPublish(body: LayoutBody): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  for (const block of body) {
    // ⚠ A hidden block is NOT validated. Hiding exists so seasonal content can be taken down and
    // brought back (FR-005); refusing to publish the page because a hidden block is incomplete would
    // make hiding useless precisely when it is needed — the operator's alternative is to delete the
    // block and lose its content, which is the thing hiding is for.
    if (block.hidden) continue;

    if (!(BLOCK_TYPES as readonly string[]).includes(block.type)) {
      issues.push({
        blockId: block.id,
        field: "",
        code: "unknown_block_type",
        message: `“${block.type}” is not a block this platform knows`,
      });
      continue;
    }

    const def = blockDefinition(block.type as BlockType);
    if (!def) continue;

    for (const field of def.fields) {
      const value = block.props[field.key];
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);

      if (field.required && missing) {
        issues.push({
          blockId: block.id,
          field: field.key,
          code: "field_required",
          message: `${field.label} is required`,
        });
        continue;
      }
      if (missing) continue;

      // ⚠ Length is checked HERE, not only in the composer's input. An over-long headline does not
      // fail — it renders, and it renders wrapped across a tile it was never designed to fill, which
      // is a defect only a person looking at the page would ever find.
      if ((field.kind === "text" || field.kind === "longText") && typeof value === "string") {
        if (value.length > field.maxLength) {
          issues.push({
            blockId: block.id,
            field: field.key,
            code: "field_too_long",
            message: `${field.label} must be ${field.maxLength} characters or fewer (this is ${value.length})`,
          });
        }
      }

      if (field.kind === "enum" && typeof value === "string") {
        const allowed = field.options.map((o) => o.value);
        if (!allowed.includes(value)) {
          issues.push({
            blockId: block.id,
            field: field.key,
            code: "field_not_an_option",
            // ⚠ The operator-facing LABELS, not the stored values — "Large" is what they chose from,
            // "large" is what the database holds, and a message naming the wrong one sends them
            // looking for a control that does not exist.
            message: `${field.label} must be one of: ${field.options.map((o) => o.label).join(", ")}`,
          });
        }
      }

      if (field.kind === "list" && Array.isArray(value)) {
        if (value.length < field.min || value.length > field.max) {
          issues.push({
            blockId: block.id,
            field: field.key,
            code: "list_out_of_range",
            message: `${field.label} must hold between ${field.min} and ${field.max} items (this has ${value.length})`,
          });
        }
      }
    }
  }

  return issues;
}
