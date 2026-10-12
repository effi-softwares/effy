import { describe, expect, it, vi } from "vitest";

import type { CardRow } from "../lib/cards";
import { completionPattern, likeLiteral, type SuggestRepository } from "./repository";
import { createSuggestService } from "./service";

const card = (id: string, name: string): CardRow =>
  ({ id, name, brand: null, price_amount: "3.00", currency: "AUD", compare_at_amount: null, storage_key: null, alt_text: null, created_at: new Date(0), created_at_key: "", available: true }) as unknown as CardRow;

function repoOf(over: Partial<SuggestRepository> = {}): SuggestRepository {
  return {
    products: vi.fn(async () => [card("p1", "Oat Milk Barista 1L")]),
    completions: vi.fn(async () => [{ phrase: "oat milk barista" }, { phrase: "oat milk original" }]),
    aislesHolding: vi.fn(async () => [{ key: "dairy_eggs", name: "Dairy & eggs" }]),
    aislesNamed: vi.fn(async () => []),
    ...over,
  };
}

describe("search suggestions", () => {
  it("answers nothing — and reads nothing — for fewer than two characters", async () => {
    const repo = repoOf();
    expect(await createSuggestService(repo).suggest("o")).toEqual({ phrases: [], products: [] });
    expect(repo.products).not.toHaveBeenCalled();
  });

  it("offers the completed text, then the text inside the aisle that holds it", async () => {
    const out = await createSuggestService(repoOf(), async () => null).suggest("oat milk");
    expect(out.phrases).toEqual([
      { text: "oat milk barista" },
      { text: "oat milk original" },
      { text: "oat milk", categorySlug: "dairy_eggs", categoryName: "Dairy & eggs" },
    ]);
    expect(out.products.map((p) => p.name)).toEqual(["Oat Milk Barista 1L"]);
  });

  it("offers an aisle by its own name as the aisle, not as a search", async () => {
    const repo = repoOf({
      completions: vi.fn(async () => []),
      aislesHolding: vi.fn(async () => []),
      aislesNamed: vi.fn(async () => [{ key: "dairy_eggs", name: "Dairy & eggs" }]),
    });
    expect((await createSuggestService(repo, async () => null).suggest("dai")).phrases).toEqual([
      { text: "Dairy & eggs", categorySlug: "dairy_eggs", categoryName: "Dairy & eggs" },
    ]);
  });

  it("never returns more than five phrases", async () => {
    const repo = repoOf({
      completions: vi.fn(async () => [{ phrase: "a1" }, { phrase: "a2" }, { phrase: "a3" }]),
      aislesNamed: vi.fn(async () => [{ key: "x", name: "X" }, { key: "y", name: "Y" }]),
    });
    expect((await createSuggestService(repo, async () => null).suggest("aa")).phrases).toHaveLength(5);
  });

  it("⚠ a shopper's own wildcard characters are matched literally", () => {
    expect(likeLiteral("100%_off\\")).toBe("100\\%\\_off\\\\");
  });

  it("⚠ the typed text can never act as a pattern", () => {
    expect(completionPattern("a.b(c)*")).toBe("(?i)(a\\.b\\(c\\)\\*\\S*(?:\\s+[^\\s\\d]\\S*)?)");
  });
});
