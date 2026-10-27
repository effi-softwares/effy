import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/** The console's analytics hook: the picker reports how a leaf was found, and sends nothing itself. */
const track = vi.fn();

import type { ShopCategory } from "./model";
import { CategoryPicker } from "./CategoryPicker";

const cat = (
  id: string,
  parentId: string | null,
  path: string[],
  isLeaf: boolean,
  synonyms: string[] = [],
): ShopCategory => ({
  id,
  parentId,
  name: path[path.length - 1]!,
  path,
  isLeaf,
  synonyms,
  icon: null,
});

const TREE: ShopCategory[] = [
  cat("dairy", null, ["Dairy, Eggs & Fridge"], false),
  cat("yog", "dairy", ["Dairy, Eggs & Fridge", "Yoghurt"], false),
  cat(
    "greek",
    "yog",
    ["Dairy, Eggs & Fridge", "Yoghurt", "Greek & Natural Yoghurt"],
    true,
    ["greek yoghurt"],
  ),
  cat("kids", "yog", ["Dairy, Eggs & Fridge", "Yoghurt", "Kids Yoghurt"], true),
  cat("elec", null, ["Electronics"], false),
  cat("chargers", "elec", ["Electronics", "Chargers & Cables"], true, [
    "charger",
    "usb cable",
  ]),
];

function setup(over: Partial<Parameters<typeof CategoryPicker>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <CategoryPicker
      categories={TREE}
      recentLeafIds={[]}
      productName=""
      value={null}
      onChange={onChange}
      onEvent={track}
      {...over}
    />,
  );
  return onChange;
}

describe("CategoryPicker (101)", () => {
  it("suggests leaves from the product's name, with their paths, and reports the rank chosen", async () => {
    const onChange = setup({ productName: "Greek Yoghurt 1kg" });
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveTextContent(
      "Dairy, Eggs & Fridge › Yoghurt › Greek & Natural Yoghurt",
    );
    await userEvent.click(first.querySelector("button")!);
    expect(onChange).toHaveBeenCalledWith("greek");
    expect(track).toHaveBeenCalledWith({
      name: "category_suggestion_chosen",
      rank: 1,
    });
  });

  it("searches leaves by name and synonym", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("tab", { name: "Search" }));
    await userEvent.type(screen.getByLabelText("Search categories"), "usb");
    const results = screen.getAllByRole("option");
    expect(results).toHaveLength(1);
    await userEvent.click(results[0]!.querySelector("button")!);
    expect(onChange).toHaveBeenCalledWith("chargers");
    expect(track).toHaveBeenCalledWith({ name: "category_searched" });
  });

  it("browses column by column; only a leaf is chosen, a parent opens the next column", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("tab", { name: "Browse" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Dairy, Eggs & Fridge/ }),
    );
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^Yoghurt$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Kids Yoghurt/ }));
    expect(onChange).toHaveBeenCalledWith("kids");
  });

  it("keeps the choice's full path in view, and lists recently used leaves", () => {
    setup({ value: "chargers", recentLeafIds: ["greek"] });
    expect(
      screen.getByText("Electronics › Chargers & Cables"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listbox", { name: "Recently used" }),
    ).toHaveTextContent("Greek & Natural Yoghurt");
  });
});
