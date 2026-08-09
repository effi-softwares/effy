import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackOfficeRole, LayoutBody } from "@effy/shared-types";

// A mutable role set drives the session mock so one suite can exercise manager vs csa.
const roleState = vi.hoisted(() => ({ roles: ["manager"] as BackOfficeRole[] }));
vi.mock("@/features/auth/queries", () => ({
  sessionQuery: {
    queryKey: ["auth", "session"],
    queryFn: async () => ({ status: "signed-in", identity: { roles: roleState.roles } }),
  },
}));

const repo = vi.hoisted(() => ({
  getLayout: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  revert: vi.fn(),
  getAudit: vi.fn(),
}));
vi.mock("./repo", () => repo);

import { HomeComposerScreen } from "./HomeComposerScreen";

const block = (id: string, type = "app_promo") => ({ id, type, props: {} });

function layout(draft: LayoutBody, published: LayoutBody = draft, revision = 3) {
  return {
    draft,
    published,
    revision,
    publishedAt: "2026-08-01T00:00:00Z",
    publishedBy: "someone",
    updatedAt: "2026-08-01T00:00:00Z",
    updatedBy: "someone",
  };
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<HomeComposerScreen />, { wrapper: Wrapper });
}

/** The rows, in the order the operator sees them. */
function blockLabels(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector("span.font-medium")?.textContent ?? "");
}

beforeEach(() => {
  roleState.roles = ["manager"];
  repo.getLayout.mockResolvedValue(layout([block("a"), block("b", "newsletter"), block("c", "value_strip")]));
  repo.saveDraft.mockImplementation(async ({ blocks }: { blocks: LayoutBody }) => layout(blocks, blocks, 4));
  repo.publish.mockImplementation(async () => layout([], [], 4));
  repo.revert.mockImplementation(async () => layout([], [], 4));
});

afterEach(() => vi.clearAllMocks());

describe("reordering", () => {
  it("moves a block up one place", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    expect(blockLabels()).toEqual(["App promotion", "Newsletter", "Value strip"]);
    await user.click(screen.getByRole("button", { name: /Move Newsletter up/ }));
    expect(blockLabels()).toEqual(["Newsletter", "App promotion", "Value strip"]);
  });

  /**
   * ⚠ THIS TEST GUARDS THE ROW KEY, and I only know that because I broke the focus effect and this
   * test kept passing.
   *
   * The property — repeat presses move the SAME block — is delivered by `key={block.id}`, not by the
   * focus effect. React moves the existing DOM nodes on a reorder, so the focused button travels with
   * its block. Keying by INDEX instead, which is the obvious thing to write, breaks it silently: the
   * browser keeps focus at that screen position and the second press moves whichever block slid into
   * the slot. Press "move up" three times, move three different blocks. Verified by changing the key
   * to the index and watching this fail.
   *
   * With reordering now keyboard-only (FR-004 as amended), that is not an accessibility nicety behind
   * a working pointer affordance — it is the only way anyone reorders anything.
   */
  it("keeps focus on the block being moved, so repeat presses move the same block", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    const button = screen.getByRole("button", { name: /Move Value strip up/ });
    button.focus();
    await user.keyboard("{Enter}");

    // ⚠ The SAME DOM node, not merely a button with a matching label. That identity is the whole
    // property: it is what proves React moved the row rather than re-rendering a new one in place.
    await waitFor(() => expect(document.activeElement).toBe(button));

    await user.keyboard("{Enter}");
    expect(blockLabels()).toEqual(["Value strip", "App promotion", "Newsletter"]);
  });

  /**
   * ⚠ Focus must survive the block reaching an end, where the control it was travelling on becomes
   * disabled. Focus on a disabled button is focus lost to the document — which drops the operator
   * back to the top of the page in the middle of their task.
   */
  it("hands focus to the opposite control when the block reaches an end", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    screen.getByRole("button", { name: /Move Newsletter up/ }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const label = document.activeElement?.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/Move Newsletter (up|down)/);
      expect((document.activeElement as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("disables the direction a block cannot travel, rather than hiding the control", () => {
    // A control that disappears makes every other control shift sideways as a block travels, so the
    // operator's pointer and their focus both land on something they did not aim at.
    renderScreen();
    return screen.findByText("App promotion").then(() => {
      expect(screen.getByRole("button", { name: /Move App promotion up/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Move Value strip down/ })).toBeDisabled();
    });
  });
});

describe("hiding versus removing", () => {
  it("keeps a hidden block on the list and says it is hidden", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    await user.click(screen.getByRole("button", { name: /Hide Newsletter/ }));
    expect(blockLabels()).toHaveLength(3);
    // ⚠ Said in words, not signalled by dimming alone — the difference between a hidden block and a
    // low-contrast one is whether shoppers can see the section.
    expect(screen.getByText("Hidden — not shown to shoppers")).toBeInTheDocument();
  });

  it("takes a removed block off the list", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    await user.click(screen.getByRole("button", { name: /Remove Newsletter/ }));
    expect(blockLabels()).toEqual(["App promotion", "Value strip"]);
  });
});

describe("saving, publishing and discarding", () => {
  it("sends the edited order with the revision it was based on", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    await user.click(screen.getByRole("button", { name: /Move Newsletter up/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalledTimes(1));
    const sent = repo.saveDraft.mock.calls[0]![0] as { blocks: LayoutBody; revision: number };
    expect(sent.blocks.map((b) => b.id)).toEqual(["b", "a", "c"]);
    // ⚠ Without this the server cannot refuse a stale write, and a second operator's publish
    // silently discards the first's work (FR-017).
    expect(sent.revision).toBe(3);
  });

  it("does not offer to save when nothing has changed", async () => {
    renderScreen();
    await screen.findByText("App promotion");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("does not offer to publish when the draft already matches what is live", async () => {
    renderScreen();
    await screen.findByText("App promotion");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("offers to publish once the draft differs from what is live", async () => {
    repo.getLayout.mockResolvedValue(layout([block("a"), block("b", "newsletter")], [block("a")]));
    renderScreen();
    await screen.findByText("App promotion");
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("publishes with the current revision", async () => {
    repo.getLayout.mockResolvedValue(layout([block("a"), block("b", "newsletter")], [block("a")], 9));
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("App promotion");

    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(repo.publish).toHaveBeenCalledWith({ revision: 9 }));
  });

  /**
   * ⚠ THE LABEL IS "DISCARD CHANGES", NOT "UNDO PUBLISH", and that wording is asserted rather than
   * left to a reviewer. With two bodies and no history there is nothing behind `published` to return
   * to — an operator who learns that at the moment they need the other behaviour learns it too late.
   */
  it("calls the discard control what it actually does", async () => {
    renderScreen();
    await screen.findByText("App promotion");
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo publish/i })).not.toBeInTheDocument();
  });
});

describe("role gating", () => {
  it("shows a csa the layout with no controls to change it", async () => {
    roleState.roles = ["csa"];
    renderScreen();
    await screen.findByText("App promotion");

    // Knowing what the storefront says is support work; changing the front page of the platform's
    // only public surface is not. The backend enforces this independently.
    expect(blockLabels()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Newsletter up/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add block" })).not.toBeInTheDocument();
  });
});

describe("the block ceiling", () => {
  it("stops at the limit and says why, rather than failing silently (FR-009)", async () => {
    const full = Array.from({ length: 20 }, (_, i) => block(`b${i}`));
    repo.getLayout.mockResolvedValue(layout(full));
    renderScreen();
    await screen.findAllByText("App promotion");

    expect(screen.getByRole("button", { name: /Add block/ })).toBeDisabled();
    expect(screen.getByText(/A layout can hold 20 blocks/)).toBeInTheDocument();
  });
});

describe("adding a block", () => {
  it("arrives pre-filled from a preset rather than as an empty shell (FR-003)", async () => {
    const user = userEvent.setup();
    repo.getLayout.mockResolvedValue(layout([block("a")]));
    renderScreen();
    await screen.findByText("App promotion");

    await user.click(screen.getByRole("button", { name: /Add block/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(repo.saveDraft).toHaveBeenCalled());
    const sent = repo.saveDraft.mock.calls[0]![0] as { blocks: LayoutBody };
    expect(sent.blocks).toHaveLength(2);
    // Whatever the first block type's preset is, it must not arrive with nothing in it.
    expect(Object.keys(sent.blocks[1]!.props).length).toBeGreaterThan(0);
  });
});
