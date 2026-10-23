import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DESIGNED_LAYOUTS, skinGeometry, starterSettings, type DesignedLayout, type GroupSize, type SkinSettings } from "@effy/shared-types";

import { PromoSkin } from "./PromoSkin";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(resolve(here, "../../../shared-types/src/promotion-skins.fixtures.json"), "utf8")) as {
  geometry: { layout: DesignedLayout; size: GroupSize; expect: { minHeight: number } }[];
  words: { layout: DesignedLayout; hasCode: boolean; settings: SkinSettings; expect: { button: string | null; label: string | null } }[];
};

const coded = { id: "p1", headline: "10% off the whole winter shop", supportingLine: "3 times per customer", code: "WINTER10" };
const plain = { id: "p2", headline: "5% off every order", supportingLine: "No minimum", code: null };
const picture = { url: "https://media.example.test/promotions/p/a.jpg", imageWidths: [320, 640], width: 1600, height: 900, alt: "A basket of oranges", focusX: 0.3, focusY: 0.6 };

describe("PromoSkin (095) — the web renderer", () => {
  it.each(fixtures.geometry)("reserves the $layout box at $size", (c) => {
    render(<PromoSkin promotion={plain} layout={c.layout} size={c.size} settings={starterSettings(c.layout)} />);
    expect(screen.getByTestId("promo-skin").style.minHeight).toBe(`${c.expect.minHeight}px`);
  });

  it.each(fixtures.words.filter((w) => w.layout !== "header_card"))(
    "says the fixture's words: $layout code=$hasCode",
    (c) => {
      render(<PromoSkin promotion={c.hasCode ? coded : plain} layout={c.layout} settings={c.settings} href="/offers/p" />);
      if (c.expect.label) expect(screen.getByText(c.expect.label)).toBeInTheDocument();
      if (c.expect.button) expect(screen.getByText(c.expect.button)).toBeInTheDocument();
    },
  );

  it("copies the code and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onCopied = vi.fn();
    render(<PromoSkin promotion={coded} layout="panel" settings={starterSettings("panel")} onCopied={onCopied} />);
    expect(screen.getByText("WINTER10")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy code: WINTER10" }));
    expect(writeText).toHaveBeenCalledWith("WINTER10");
    expect(onCopied).toHaveBeenCalledWith("WINTER10");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("without a code, the button is the link to the offer", () => {
    render(<PromoSkin promotion={plain} layout="panel" settings={starterSettings("panel")} href="/offers/p2" />);
    expect(screen.getByRole("link", { name: "View offer: 5% off every order" })).toHaveAttribute("href", "/offers/p2");
  });

  it("draws the picture with its copies and focus, behind words that come first", () => {
    render(<PromoSkin promotion={plain} layout="full_picture" settings={starterSettings("full_picture")} picture={picture} />);
    const img = screen.getByRole("img", { name: "A basket of oranges" });
    expect(img.getAttribute("srcset")).toBe(
      "https://media.example.test/renditions/promotions/p/a/w320.webp 320w, https://media.example.test/renditions/promotions/p/a/w640.webp 640w",
    );
    expect(img.style.objectPosition).toBe("30% 60%");
    // The colour is under the picture while it loads.
    expect(screen.getByTestId("promo-skin").style.background).toBe("rgb(24, 24, 27)");
  });

  it("decorations are hidden from assistive tech, and absent over a picture", () => {
    const { container, rerender } = render(<PromoSkin promotion={plain} layout="panel" settings={starterSettings("panel")} />);
    expect(container.querySelector(".eps-decor")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<PromoSkin promotion={plain} layout="panel" settings={{ ...starterSettings("panel"), background: { colour: "#1d4ed8", picture: "show", tint: { colour: "#000000", strength: 0.5 } } }} picture={picture} />);
    expect(container.querySelector(".eps-decor")).toBeNull();
  });

  it.each(DESIGNED_LAYOUTS)("draws %s with its starter settings", (layout) => {
    render(<PromoSkin promotion={coded} layout={layout} settings={starterSettings(layout)} picture={picture} />);
    expect(screen.getByRole("heading", { name: coded.headline })).toBeInTheDocument();
    expect(skinGeometry(layout, "large") ?? skinGeometry(layout, "medium") ?? skinGeometry(layout, "small") ?? skinGeometry(layout, "strip")).not.toBeNull();
  });

  it("⚠ uses no token and no Tailwind colour utility — a skin's colours are its own", () => {
    for (const f of readdirSync(here).filter((n) => /\.tsx?$/.test(n) && !n.includes(".test."))) {
      const src = readFileSync(resolve(here, f), "utf8");
      expect(src, f).not.toMatch(/\b(bg|text|border|fill|stroke)-(primary|brand|foreground|background|muted|accent|white|black|[a-z]+-\d{2,3})\b/);
      expect(src, f).not.toMatch(/var\(--(?!font-mono)/);
    }
  });
});
