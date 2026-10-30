/**
 * Promotion skins: how a promotion looks in one place, as data. A skin is one layout from the closed
 * list plus a settings document; the website, back-office's previews and the customer app all draw from
 * this declaration. Every function is pure and runs on both sides:
 *
 *  validateSkin - the shape, the bounds and the layout's own rules;
 *  skinContrast - WCAG aa for every piece of text on what it sits on (the server refuses an unreadable skin);
 *  skinGeometry - the sizes both renderers draw, pinned by `promotion-skins.fixtures.json`;
 *  buttonWords / labelWords / pickPicture - choices both renderers make the same way.
 *
 * `classic` is the one built-in skin: each client keeps its own drawing for it, and the admin service
 * never updates or removes it.
 */

// The closed lists

export const SKIN_LAYOUTS = ["classic", "panel", "header_card", "full_picture", "picture_beside", "tile", "strip"] as const;
export type SkinLayout = (typeof SKIN_LAYOUTS)[number];
/** The layouts staff can design with (`classic` is built in). */
export type DesignedLayout = Exclude<SkinLayout, "classic">;
export const DESIGNED_LAYOUTS: readonly DesignedLayout[] = ["panel", "header_card", "full_picture", "picture_beside", "tile", "strip"];

export const GROUP_SIZES = ["large", "medium", "small", "strip"] as const;
export type GroupSize = (typeof GROUP_SIZES)[number];

export const TEXT_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const WEIGHTS = ["regular", "medium", "semibold", "bold"] as const;
export type Weight = (typeof WEIGHTS)[number];
export const ALIGNS = ["start", "center", "end"] as const;
export type Align = (typeof ALIGNS)[number];
export const SPACINGS = ["compact", "regular", "roomy"] as const;
export type Spacing = (typeof SPACINGS)[number];
export const RADII = ["none", "sm", "md", "lg", "xl"] as const;
export type Radius = (typeof RADII)[number];
export const BUTTON_STYLES = ["filled", "outline", "link", "none"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export const CHIP_STYLES = ["dashed", "solid", "filled"] as const;
export type ChipStyle = (typeof CHIP_STYLES)[number];
export const DECORATION_SETS = ["food", "produce", "bakery", "drinks", "seasonal-winter", "seasonal-summer", "celebration"] as const;
export type DecorationSet = (typeof DECORATION_SETS)[number];
export const TEXT_CORNERS = ["top-start", "bottom-start", "center", "bottom-end"] as const;
export type TextCorner = (typeof TEXT_CORNERS)[number];

/** `#rrggbb`, lowercase once saved. */
export type Colour = string;

export interface TextStyle {
  colour: Colour;
  size: TextSize;
  weight: Weight;
  lines: 1 | 2 | 3;
}

export interface SkinBackground {
  colour: Colour;
  /** Show the promotion's picture. Required layouts (`full_picture`, `picture_beside`) always do. */
  picture: "none" | "show";
  /** Laid over the picture under the words. Strength 0–0.9. */
  tint?: { colour: Colour; strength: number };
}

export interface SkinColours {
  background: SkinBackground;
  label: { show: boolean; words: string; colour: Colour; size: "xs" | "sm"; tracking: "normal" | "wide" };
  headline: TextStyle;
  supporting: TextStyle & { show: boolean };
  button: { style: ButtonStyle; fill: Colour; text: Colour; words: string; icon: boolean };
  chip: { show: boolean; style: ChipStyle; fill: Colour; text: Colour };
  decorations: { show: boolean; set: DecorationSet; colour: Colour; strength: number };
}

/** The settings of a designed skin. Layout-only fields are present on their layout alone. */
export interface SkinSettings extends SkinColours {
  align: Align;
  shape: { radius: Radius; spacing: Spacing; outline: Colour | null };
  /** `header_card`: the body under the header, and the colour of its "Code"/"Offer" tag. */
  body?: { colour: Colour; tagColour: Colour };
  /** `full_picture`: where the words sit. */
  textCorner?: TextCorner;
  /** `picture_beside`: which side the picture is on, and how it fills its half. */
  pictureSide?: "start" | "end";
  pictureFit?: "cover" | "contain";
  /** The customer app's dark appearance. Absent → the skin looks the same in both. */
  dark?: Partial<SkinColours> & { body?: { colour: Colour; tagColour: Colour } };
}

/** `label.words` / `button.words` value meaning "the promotion's own word". */
export const AUTO = "auto";

// Layout facts

/** The sizes of place each layout fits. A group offers only skins whose layout fits its size. */
export const LAYOUT_FITS: Record<SkinLayout, readonly GroupSize[]> = {
  classic: GROUP_SIZES,
  panel: ["large", "medium"],
  header_card: ["medium", "small"],
  full_picture: ["large", "medium"],
  picture_beside: ["large", "medium", "strip"],
  tile: ["small", "medium"],
  strip: ["strip"],
};

/** "required": always shows a picture when there is one; "optional": when `background.picture` is "show". */
export const LAYOUT_SHOWS_PICTURE: Record<DesignedLayout, "required" | "optional"> = {
  panel: "optional",
  header_card: "optional",
  full_picture: "required",
  picture_beside: "required",
  tile: "optional",
  strip: "optional",
};

/** The picture shape each layout prefers (width ÷ height), for picking the best-fitting picture. */
export const LAYOUT_RATIO: Record<DesignedLayout, number> = {
  panel: 16 / 9,
  header_card: 16 / 9,
  full_picture: 16 / 9,
  picture_beside: 1,
  tile: 1,
  strip: 1,
};

/** Whether the words are laid over the picture (and so need a tint) in this layout. */
export function wordsOverPicture(layout: DesignedLayout): boolean {
  return layout === "panel" || layout === "header_card" || layout === "full_picture" || layout === "tile";
}

export function layoutFits(layout: SkinLayout, size: GroupSize): boolean {
  return LAYOUT_FITS[layout].includes(size);
}

// Geometry (both renderers draw these numbers: px on the web, dp in the app)

export const TEXT_PX: Record<TextSize, number> = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, "2xl": 32 };
export const SPACING_PX: Record<Spacing, number> = { compact: 16, regular: 24, roomy: 32 };
export const RADIUS_PX: Record<Radius, number> = { none: 0, sm: 4, md: 6, lg: 8, xl: 10 };
export const WEIGHT_NUM: Record<Weight, number> = { regular: 400, medium: 500, semibold: 600, bold: 700 };
/** Large text for WCAG: 24px and up. */
export const LARGE_TEXT: readonly TextSize[] = ["xl", "2xl"];

export interface SkinGeometry {
  /** The box's minimum height; the box never shrinks below it, so a late picture moves nothing. */
  minHeight: number;
  /** Width ÷ height of the picture region (the whole box, or the header, or the picture half). */
  pictureRatio: number;
  /** The share of the width the words may use (0–1); the rest is decorations or picture. */
  wordsWidth: number;
  /** Decorations are drawn at all at this size. */
  decorations: boolean;
}

const GEOMETRY: Record<DesignedLayout, Partial<Record<GroupSize, SkinGeometry>>> = {
  panel: {
    large: { minHeight: 320, pictureRatio: 16 / 9, wordsWidth: 0.55, decorations: true },
    medium: { minHeight: 152, pictureRatio: 16 / 9, wordsWidth: 0.62, decorations: true },
  },
  header_card: {
    medium: { minHeight: 300, pictureRatio: 16 / 9, wordsWidth: 0.55, decorations: true },
    small: { minHeight: 240, pictureRatio: 16 / 9, wordsWidth: 0.7, decorations: true },
  },
  full_picture: {
    large: { minHeight: 320, pictureRatio: 16 / 9, wordsWidth: 0.6, decorations: false },
    medium: { minHeight: 200, pictureRatio: 16 / 9, wordsWidth: 0.8, decorations: false },
  },
  picture_beside: {
    large: { minHeight: 280, pictureRatio: 1, wordsWidth: 0.5, decorations: false },
    medium: { minHeight: 180, pictureRatio: 1, wordsWidth: 0.55, decorations: false },
    strip: { minHeight: 88, pictureRatio: 1, wordsWidth: 0.8, decorations: false },
  },
  tile: {
    small: { minHeight: 180, pictureRatio: 1, wordsWidth: 1, decorations: true },
    medium: { minHeight: 220, pictureRatio: 1, wordsWidth: 1, decorations: true },
  },
  strip: {
    strip: { minHeight: 64, pictureRatio: 1, wordsWidth: 0.7, decorations: false },
  },
};

/** The geometry of a designed layout at a size it fits; null when it does not fit. */
export function skinGeometry(layout: DesignedLayout, size: GroupSize): SkinGeometry | null {
  return GEOMETRY[layout][size] ?? null;
}

/** Every size the layout fits, largest first, for a client not told the size. */
export function defaultSize(layout: DesignedLayout): GroupSize {
  return (GROUP_SIZES.find((s) => GEOMETRY[layout][s]) ?? "medium") as GroupSize;
}

// Words both renderers choose the same way

/** The button's words, or null when the skin shows no button. */
export function buttonWords(settings: Pick<SkinSettings, "button">, hasCode: boolean): string | null {
  if (settings.button.style === "none") return null;
  if (settings.button.words === AUTO) return hasCode ? "Copy code" : "View offer";
  return settings.button.words;
}

/** The small label's words, or null when hidden. */
export function labelWords(settings: Pick<SkinSettings, "label">, hasCode: boolean): string | null {
  if (!settings.label.show) return null;
  return settings.label.words === AUTO ? (hasCode ? "Code" : "Offer") : settings.label.words;
}

/** The colours in force: light, or the dark overrides merged over them (the customer app only). */
export function coloursFor(settings: SkinSettings, appearance: "light" | "dark"): SkinSettings {
  if (appearance === "light" || !settings.dark) return settings;
  const d = settings.dark;
  return {
    ...settings,
    background: d.background ?? settings.background,
    label: d.label ?? settings.label,
    headline: d.headline ?? settings.headline,
    supporting: d.supporting ?? settings.supporting,
    button: d.button ?? settings.button,
    chip: d.chip ?? settings.chip,
    decorations: d.decorations ?? settings.decorations,
    body: d.body ?? settings.body,
  };
}

export interface PictureChoice {
  id: string;
  width: number;
  height: number;
  position: number;
}

/** Which picture a placement shows: the chosen one if it still exists, else the closest to the layout's preferred shape (lowest position on a tie), else none. */
export function pickPicture<T extends PictureChoice>(
  layout: DesignedLayout,
  settings: Pick<SkinSettings, "background">,
  pictures: readonly T[],
  chosenId: string | null,
): T | null {
  if (LAYOUT_SHOWS_PICTURE[layout] === "optional" && settings.background.picture !== "show") return null;
  if (pictures.length === 0) return null;
  const chosen = chosenId ? pictures.find((p) => p.id === chosenId) : undefined;
  if (chosen) return chosen;
  const want = Math.log(LAYOUT_RATIO[layout]);
  return [...pictures].sort((a, b) => {
    const da = Math.abs(Math.log(a.width / a.height) - want);
    const db = Math.abs(Math.log(b.width / b.height) - want);
    return da !== db ? da - db : a.position - b.position;
  })[0]!;
}

// Readability (WCAG 2.x)

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isColour(v: unknown): v is Colour {
  return typeof v === "string" && HEX.test(v);
}

function rgb(hex: Colour): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function hexOf([r, g, b]: [number, number, number]): Colour {
  return "#" + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
}

function luminance(hex: Colour): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours, rounded down to two places (never rounds a fail into a pass). */
export function contrastRatio(a: Colour, b: Colour): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** `tint` at `strength` laid over `base`. */
export function blend(tint: Colour, strength: number, base: Colour): Colour {
  const t = rgb(tint);
  const b = rgb(base);
  return hexOf([0, 1, 2].map((i) => t[i]! * strength + b[i]! * (1 - strength)) as [number, number, number]);
}

export interface ContrastPair {
  /** Machine name: `headline/background`, `button/fill`, `headline/picture-dark`, … */
  pair: string;
  /** A sentence for the editor: "Headline on the background". */
  label: string;
  ratio: number;
  required: number;
  ok: boolean;
}

const LABELS: Record<string, string> = {
  label: "Label",
  headline: "Headline",
  supporting: "Supporting line",
  button: "Button words",
  chip: "Code",
  tag: "Code tag",
};
const GROUNDS: Record<string, string> = {
  background: "the background",
  "picture-dark": "a dark picture under the tint",
  "picture-light": "a light picture under the tint",
  fill: "the button",
  "chip-fill": "the code chip",
  body: "the card body",
};

/**
 * Every piece of text against what it sits on. Text over a picture is judged twice, on the tint over
 * black and over white, so it reads on any picture; the background colour is always judged too (it
 * shows before a picture loads, and when there is none).
 */
export function skinContrast(layout: DesignedLayout, settings: SkinSettings): ContrastPair[] {
  const out: ContrastPair[] = [];
  const check = (who: string, fg: Colour, ground: string, bg: Colour, large: boolean) => {
    if (!isColour(fg) || !isColour(bg)) return;
    const required = large ? 3 : 4.5;
    const ratio = contrastRatio(fg, bg);
    out.push({ pair: `${who}/${ground}`, label: `${LABELS[who]} on ${GROUNDS[ground]}`, ratio, required, ok: ratio >= required });
  };

  const s = settings;
  const shows = LAYOUT_SHOWS_PICTURE[layout] === "required" || s.background.picture === "show";
  const overPicture = shows && wordsOverPicture(layout);
  // The grounds the top words sit on.
  const tops: [string, Colour][] = [["background", s.background.colour]];
  if (overPicture && s.background.tint && isColour(s.background.tint.colour)) {
    tops.push(["picture-dark", blend(s.background.tint.colour, s.background.tint.strength, "#000000")]);
    tops.push(["picture-light", blend(s.background.tint.colour, s.background.tint.strength, "#ffffff")]);
  }
  // header_card: only the label and headline are in the header; the rest sits on the body.
  const bodyGround: [string, Colour][] = layout === "header_card" && s.body ? [["body", s.body.colour]] : tops;

  for (const [g, bg] of tops) {
    if (s.label.show) check("label", s.label.colour, g, bg, false);
    check("headline", s.headline.colour, g, bg, LARGE_TEXT.includes(s.headline.size));
  }
  for (const [g, bg] of bodyGround) {
    if (s.supporting.show && layout !== "tile" && layout !== "strip") {
      check("supporting", s.supporting.colour, g, bg, LARGE_TEXT.includes(s.supporting.size));
    }
    if (s.button.style === "filled") check("button", s.button.text, "fill", s.button.fill, false);
    else if (s.button.style !== "none") check("button", s.button.text, g, bg, false);
    if (s.chip.show) {
      if (s.chip.style === "filled") check("chip", s.chip.text, "chip-fill", s.chip.fill, false);
      else check("chip", s.chip.text, g, bg, false);
    }
  }
  if (layout === "header_card" && s.body) check("tag", s.body.tagColour, "body", s.body.colour, false);
  // A filled button is judged once, not once per ground.
  return out.filter((p, i) => out.findIndex((q) => q.pair === p.pair) === i);
}

// Validation

export interface SkinIssue {
  field: string;
  message: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

function only(issues: SkinIssue[], path: string, v: Record<string, unknown>, keys: readonly string[]) {
  for (const k of Object.keys(v)) if (!keys.includes(k)) issues.push({ field: `${path}${k}`, message: "Not a setting of this skin." });
}

function colour(issues: SkinIssue[], field: string, v: unknown) {
  if (!isColour(v)) issues.push({ field, message: "A colour is six hexadecimal digits after #, like #1d4ed8." });
}

function num(issues: SkinIssue[], field: string, v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) issues.push({ field, message: `A number from ${min} to ${max}.` });
}

function pick(issues: SkinIssue[], field: string, list: readonly string[], v: unknown) {
  if (!oneOf(list, v)) issues.push({ field, message: `One of: ${list.join(", ")}.` });
}

function words(issues: SkinIssue[], field: string, v: unknown, max: number) {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > max || /[\r\n]/.test(v)) {
    issues.push({ field, message: `1 to ${max} characters on one line, or "auto".` });
  }
}

function textStyle(issues: SkinIssue[], path: string, v: unknown, extra: readonly string[] = []) {
  if (!isObj(v)) return void issues.push({ field: path, message: "Missing." });
  only(issues, `${path}.`, v, ["colour", "size", "weight", "lines", ...extra]);
  colour(issues, `${path}.colour`, v.colour);
  pick(issues, `${path}.size`, TEXT_SIZES, v.size);
  pick(issues, `${path}.weight`, WEIGHTS, v.weight);
  if (v.lines !== 1 && v.lines !== 2 && v.lines !== 3) issues.push({ field: `${path}.lines`, message: "1, 2 or 3." });
}

function colours(issues: SkinIssue[], path: string, v: Record<string, unknown>, partial: boolean) {
  const has = (k: string) => !partial || k in v;
  if (has("background")) {
    const b = v.background;
    if (!isObj(b)) issues.push({ field: `${path}background`, message: "Missing." });
    else {
      only(issues, `${path}background.`, b, ["colour", "picture", "tint"]);
      colour(issues, `${path}background.colour`, b.colour);
      pick(issues, `${path}background.picture`, ["none", "show"], b.picture);
      if (b.tint !== undefined) {
        if (!isObj(b.tint)) issues.push({ field: `${path}background.tint`, message: "Missing." });
        else {
          only(issues, `${path}background.tint.`, b.tint, ["colour", "strength"]);
          colour(issues, `${path}background.tint.colour`, b.tint.colour);
          num(issues, `${path}background.tint.strength`, b.tint.strength, 0, 0.9);
        }
      }
    }
  }
  if (has("label")) {
    const l = v.label;
    if (!isObj(l)) issues.push({ field: `${path}label`, message: "Missing." });
    else {
      only(issues, `${path}label.`, l, ["show", "words", "colour", "size", "tracking"]);
      if (typeof l.show !== "boolean") issues.push({ field: `${path}label.show`, message: "Shown or hidden." });
      words(issues, `${path}label.words`, l.words, 16);
      colour(issues, `${path}label.colour`, l.colour);
      pick(issues, `${path}label.size`, ["xs", "sm"], l.size);
      pick(issues, `${path}label.tracking`, ["normal", "wide"], l.tracking);
    }
  }
  if (has("headline")) textStyle(issues, `${path}headline`, v.headline);
  if (has("supporting")) {
    textStyle(issues, `${path}supporting`, v.supporting, ["show"]);
    if (isObj(v.supporting) && typeof v.supporting.show !== "boolean") issues.push({ field: `${path}supporting.show`, message: "Shown or hidden." });
  }
  if (has("button")) {
    const b = v.button;
    if (!isObj(b)) issues.push({ field: `${path}button`, message: "Missing." });
    else {
      only(issues, `${path}button.`, b, ["style", "fill", "text", "words", "icon"]);
      pick(issues, `${path}button.style`, BUTTON_STYLES, b.style);
      colour(issues, `${path}button.fill`, b.fill);
      colour(issues, `${path}button.text`, b.text);
      words(issues, `${path}button.words`, b.words, 24);
      if (typeof b.icon !== "boolean") issues.push({ field: `${path}button.icon`, message: "Shown or hidden." });
    }
  }
  if (has("chip")) {
    const c = v.chip;
    if (!isObj(c)) issues.push({ field: `${path}chip`, message: "Missing." });
    else {
      only(issues, `${path}chip.`, c, ["show", "style", "fill", "text"]);
      if (typeof c.show !== "boolean") issues.push({ field: `${path}chip.show`, message: "Shown or hidden." });
      pick(issues, `${path}chip.style`, CHIP_STYLES, c.style);
      colour(issues, `${path}chip.fill`, c.fill);
      colour(issues, `${path}chip.text`, c.text);
    }
  }
  if (has("decorations")) {
    const d = v.decorations;
    if (!isObj(d)) issues.push({ field: `${path}decorations`, message: "Missing." });
    else {
      only(issues, `${path}decorations.`, d, ["show", "set", "colour", "strength"]);
      if (typeof d.show !== "boolean") issues.push({ field: `${path}decorations.show`, message: "Shown or hidden." });
      pick(issues, `${path}decorations.set`, DECORATION_SETS, d.set);
      colour(issues, `${path}decorations.colour`, d.colour);
      num(issues, `${path}decorations.strength`, d.strength, 0, 1);
    }
  }
}

function body(issues: SkinIssue[], field: string, v: unknown) {
  if (!isObj(v)) return void issues.push({ field, message: "Missing." });
  only(issues, `${field}.`, v, ["colour", "tagColour"]);
  colour(issues, `${field}.colour`, v.colour);
  colour(issues, `${field}.tagColour`, v.tagColour);
}

const COMMON_KEYS = ["background", "label", "headline", "supporting", "button", "chip", "decorations", "align", "shape", "dark"];
const LAYOUT_KEYS: Record<DesignedLayout, readonly string[]> = {
  panel: [],
  header_card: ["body"],
  full_picture: ["textCorner"],
  picture_beside: ["pictureSide", "pictureFit"],
  tile: [],
  strip: [],
};

/** Everything wrong with a skin's settings as `{ field, message }`; empty when it may be saved (readability is `skinContrast`). */
export function validateSkin(layout: unknown, settings: unknown): SkinIssue[] {
  const issues: SkinIssue[] = [];
  if (!oneOf(DESIGNED_LAYOUTS, layout)) return [{ field: "layout", message: `One of: ${DESIGNED_LAYOUTS.join(", ")}.` }];
  if (!isObj(settings)) return [{ field: "settings", message: "Missing." }];
  only(issues, "", settings, [...COMMON_KEYS, ...LAYOUT_KEYS[layout]]);
  colours(issues, "", settings, false);
  pick(issues, "align", ALIGNS, settings.align);
  const shape = settings.shape;
  if (!isObj(shape)) issues.push({ field: "shape", message: "Missing." });
  else {
    only(issues, "shape.", shape, ["radius", "spacing", "outline"]);
    pick(issues, "shape.radius", RADII, shape.radius);
    pick(issues, "shape.spacing", SPACINGS, shape.spacing);
    if (shape.outline !== null) colour(issues, "shape.outline", shape.outline);
  }
  if (layout === "header_card") body(issues, "body", settings.body);
  if (layout === "full_picture") pick(issues, "textCorner", TEXT_CORNERS, settings.textCorner);
  if (layout === "picture_beside") {
    pick(issues, "pictureSide", ["start", "end"], settings.pictureSide);
    pick(issues, "pictureFit", ["cover", "contain"], settings.pictureFit);
  }
  // What the layout cannot show.
  if ((layout === "tile" || layout === "strip") && isObj(settings.supporting) && settings.supporting.show === true) {
    issues.push({ field: "supporting.show", message: "This layout has no supporting line." });
  }
  if (layout === "strip" && isObj(settings.headline) && settings.headline.lines !== 1) {
    issues.push({ field: "headline.lines", message: "A strip has one line." });
  }
  // Words over a picture need a tint.
  const shows = LAYOUT_SHOWS_PICTURE[layout] === "required" || (isObj(settings.background) && settings.background.picture === "show");
  if (shows && wordsOverPicture(layout) && isObj(settings.background) && settings.background.tint === undefined) {
    issues.push({ field: "background.tint", message: "Words over a picture need a tint under them." });
  }
  if (settings.dark !== undefined) {
    if (!isObj(settings.dark)) issues.push({ field: "dark", message: "Missing." });
    else {
      only(issues, "dark.", settings.dark, ["background", "label", "headline", "supporting", "button", "chip", "decorations", "body"]);
      colours(issues, "dark.", settings.dark, true);
      if ("body" in settings.dark) body(issues, "dark.body", settings.dark.body);
    }
  }
  return issues;
}

/** Validation and readability together: what the server refuses a save for. */
export function skinProblems(layout: DesignedLayout, settings: SkinSettings): { issues: SkinIssue[]; unreadable: ContrastPair[] } {
  const issues = validateSkin(layout, settings);
  if (issues.length > 0) return { issues, unreadable: [] };
  const unreadable = skinContrast(layout, settings).filter((p) => !p.ok);
  const dark = settings.dark ? skinContrast(layout, coloursFor(settings, "dark")).filter((p) => !p.ok).map((p) => ({ ...p, pair: `dark:${p.pair}`, label: `${p.label} (dark)` })) : [];
  return { issues, unreadable: [...unreadable, ...dark] };
}

// Starting points

/** A readable new skin of each layout, where the editor starts. */
export function starterSettings(layout: DesignedLayout): SkinSettings {
  const base: SkinSettings = {
    background: { colour: "#1d4ed8", picture: "none" },
    label: { show: true, words: AUTO, colour: "#ffffff", size: "xs", tracking: "wide" },
    headline: { colour: "#ffffff", size: "xl", weight: "semibold", lines: 2 },
    supporting: { show: true, colour: "#ffffff", size: "sm", weight: "regular", lines: 2 },
    button: { style: "filled", fill: "#ffffff", text: "#111827", words: AUTO, icon: true },
    chip: { show: true, style: "dashed", fill: "#ffffff", text: "#ffffff" },
    decorations: { show: true, set: "food", colour: "#ffffff", strength: 0.2 },
    align: "start",
    shape: { radius: "xl", spacing: "regular", outline: null },
  };
  switch (layout) {
    case "panel":
      return base;
    case "header_card":
      return {
        ...base,
        background: { colour: "#c2410c", picture: "none" },
        supporting: { ...base.supporting, colour: "#52525b" },
        button: { style: "link", fill: "#ffffff", text: "#1d4ed8", words: AUTO, icon: true },
        chip: { show: false, style: "filled", fill: "#f4f4f5", text: "#18181b" },
        body: { colour: "#ffffff", tagColour: "#18181b" },
      };
    case "full_picture":
      return {
        ...base,
        background: { colour: "#18181b", picture: "show", tint: { colour: "#000000", strength: 0.6 } },
        decorations: { ...base.decorations, show: false },
        textCorner: "bottom-start",
      };
    case "picture_beside":
      return {
        ...base,
        background: { colour: "#ffffff", picture: "show" },
        label: { ...base.label, colour: "#1d4ed8" },
        headline: { ...base.headline, colour: "#18181b" },
        supporting: { ...base.supporting, colour: "#52525b" },
        button: { ...base.button, fill: "#1d4ed8", text: "#ffffff" },
        chip: { show: true, style: "dashed", fill: "#ffffff", text: "#18181b" },
        decorations: { ...base.decorations, show: false },
        shape: { radius: "xl", spacing: "regular", outline: "#e4e4e7" },
        pictureSide: "end",
        pictureFit: "cover",
      };
    case "tile":
      return {
        ...base,
        headline: { ...base.headline, size: "lg", lines: 2 },
        supporting: { ...base.supporting, show: false },
        button: { ...base.button, style: "none" },
        chip: { ...base.chip, show: false },
      };
    case "strip":
      return {
        ...base,
        label: { ...base.label, show: false },
        headline: { ...base.headline, size: "md", lines: 1 },
        supporting: { ...base.supporting, show: false },
        button: { ...base.button, style: "link", text: "#ffffff" },
        decorations: { ...base.decorations, show: false },
        shape: { radius: "lg", spacing: "compact", outline: null },
      };
  }
}
