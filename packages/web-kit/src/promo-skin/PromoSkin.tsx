"use client";

import { useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";

import {
  buttonWords,
  defaultSize,
  labelWords,
  RADIUS_PX,
  renditionUrl,
  skinGeometry,
  SPACING_PX,
  TEXT_PX,
  WEIGHT_NUM,
  type DesignedLayout,
  type GroupSize,
  type ShopperSkinPictureDTO,
  type SkinSettings,
  type TextStyle,
} from "@effy/shared-types";

import { Decorations, rgba } from "./decorations";
import { PROMO_SKIN_CSS } from "./styles";

/**
 * One promotion drawn in a staff-designed skin, used by the customer website and back-office's editor
 * and previews alike; the customer app's `PromoSkin.kt` draws the same layouts from
 * `promotion-skins.fixtures.json`. `classic` is not drawn here (each client keeps its own).
 *  · the box never shrinks below the layout's height and the colour is under the picture, so a late
 *  picture moves nothing;
 *  · reading order is label, headline, supporting line, picture description, action; decorations are
 *  hidden from assistive tech;
 *  · with a code the button copies it; without one the skin is a single link.
 */

export interface PromoSkinPromotion {
  id: string;
  headline: string;
  supportingLine: string | null;
  code: string | null;
  terms?: string | null;
}

/** The link element a host app uses (Next's `Link`, TanStack Router's, or a plain anchor). */
export type PromoSkinLink = ComponentType<{ href: string; className?: string; style?: CSSProperties; "aria-label"?: string; children: ReactNode }>;

export interface PromoSkinProps {
  promotion: PromoSkinPromotion;
  layout: DesignedLayout;
  settings: SkinSettings;
  /** The size of the place; defaults to the largest the layout fits. */
  size?: GroupSize;
  picture?: ShopperSkinPictureDTO | null;
  /** Where a tap goes. Null: no link (back-office previews). */
  href?: string | null;
  link?: PromoSkinLink;
  /** Called after the code is copied (analytics, a toast). */
  onCopied?: (code: string) => void;
  /** Called when the skin's link is followed. */
  onOpen?: () => void;
  /** `sizes` for the picture's srcset; defaults to the full width of the viewport. */
  imageSizes?: string;
  className?: string;
}

const PlainLink: PromoSkinLink = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

function text(style: TextStyle): CSSProperties {
  return {
    color: style.colour,
    fontSize: TEXT_PX[style.size],
    fontWeight: WEIGHT_NUM[style.weight],
    WebkitLineClamp: style.lines,
  };
}

function Picture({ picture, className, fit = "cover", sizes }: { picture: ShopperSkinPictureDTO; className?: string; fit?: "cover" | "contain"; sizes?: string }) {
  const srcSet = picture.imageWidths?.length ? picture.imageWidths.map((w) => `${renditionUrl(picture.url, w)} ${w}w`).join(", ") : undefined;
  return (
    <img
      src={picture.url}
      srcSet={srcSet}
      sizes={srcSet ? (sizes ?? "100vw") : undefined}
      alt={picture.alt}
      loading="lazy"
      decoding="async"
      width={picture.width}
      height={picture.height}
      className={className}
      style={{ objectFit: fit, objectPosition: `${picture.focusX * 100}% ${picture.focusY * 100}%` }}
    />
  );
}

function Tint({ settings }: { settings: SkinSettings }) {
  const t = settings.background.tint;
  return t ? <span aria-hidden="true" className="eps-tint" style={{ background: rgba(t.colour, t.strength) }} /> : null;
}

function CopyButton({ code, words, s, onCopied }: { code: string; words: string; s: SkinSettings; onCopied?: (code: string) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopied?.(code);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard still shows the code in its chip.
    }
  }
  return (
    <button type="button" className={buttonClass(s)} style={buttonStyle(s)} onClick={() => void copy()} aria-label={`${words}: ${code}`}>
      {s.button.icon ? copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" /> : null}
      <span aria-live="polite">{copied ? "Copied" : words}</span>
    </button>
  );
}

function buttonClass(s: SkinSettings): string {
  return `eps-btn${s.button.style === "link" ? " is-link" : ""}`;
}

function buttonStyle(s: SkinSettings): CSSProperties {
  switch (s.button.style) {
    case "filled":
      return { background: s.button.fill, color: s.button.text };
    case "outline":
      return { borderColor: s.button.text, color: s.button.text };
    default:
      return { color: s.button.text };
  }
}

function chipStyle(s: SkinSettings): CSSProperties {
  switch (s.chip.style) {
    case "filled":
      return { background: s.chip.fill, color: s.chip.text };
    case "solid":
      return { border: `1px solid ${s.chip.text}`, color: s.chip.text };
    default:
      return { border: `1px dashed ${s.chip.text}`, color: s.chip.text };
  }
}

/** The code chip and the button: copy with a code, a link without one. */
function Actions({ p, props }: { p: PromoSkinPromotion; props: PromoSkinProps }) {
  const s = props.settings;
  const words = buttonWords(s, p.code !== null);
  const Link = props.link ?? PlainLink;
  const chip = s.chip.show && p.code ? (
    <span className="eps-chip" style={chipStyle(s)}>
      {p.code}
    </span>
  ) : null;
  let button: ReactNode = null;
  if (words && p.code) button = <CopyButton code={p.code} words={words} s={s} onCopied={props.onCopied} />;
  else if (words && props.href) {
    button = (
      <Link href={props.href} className={`${buttonClass(s)} eps-stretch`} style={buttonStyle(s)} aria-label={`${words}: ${p.headline}`}>
        {words}
        {s.button.icon ? <ArrowRight aria-hidden="true" /> : null}
      </Link>
    );
  } else if (words) {
    button = (
      <span className={buttonClass(s)} style={buttonStyle(s)}>
        {words}
        {s.button.icon ? <ArrowRight aria-hidden="true" /> : null}
      </span>
    );
  }
  if (!chip && !button) return null;
  return (
    <div className="eps-actions">
      {chip}
      {button}
    </div>
  );
}

/** Label, headline, supporting line - the words every layout but the header card draws in one block. */
function Words({ p, s, label, supporting = true, style, children }: { p: PromoSkinPromotion; s: SkinSettings; label: string | null; supporting?: boolean; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className="eps-words" style={{ alignItems: s.align === "center" ? "center" : s.align === "end" ? "flex-end" : "flex-start", textAlign: s.align === "start" ? "start" : s.align, ...style }}>
      {label ? (
        <p className="eps-label" style={{ color: s.label.colour, fontSize: TEXT_PX[s.label.size], letterSpacing: s.label.tracking === "wide" ? "0.08em" : undefined }}>
          {label}
        </p>
      ) : null}
      <h3 className="eps-head" style={text(s.headline)}>
        {p.headline}
      </h3>
      {supporting && s.supporting.show && p.supportingLine ? (
        <p className="eps-sub" style={text(s.supporting)}>
          {p.supportingLine}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function PromoSkin(props: PromoSkinProps) {
  const { promotion: p, layout, settings: s } = props;
  const size = props.size ?? defaultSize(layout);
  const geo = skinGeometry(layout, size) ?? skinGeometry(layout, defaultSize(layout))!;
  const pad = SPACING_PX[s.shape.spacing];
  const label = labelWords(s, p.code !== null);
  const picture = props.picture ?? null;
  const Link = props.link ?? PlainLink;
  // Without a code and without a button, the whole skin is the link (stretched over it).
  const wholeLink = !p.code && props.href && buttonWords(s, false) === null;

  const frame: CSSProperties = {
    minHeight: geo.minHeight,
    borderRadius: RADIUS_PX[s.shape.radius],
    background: s.background.colour,
    border: s.shape.outline ? `1px solid ${s.shape.outline}` : undefined,
  };
  const decor =
    s.decorations.show && geo.decorations && !picture ? (
      <Decorations set={s.decorations.set} colour={s.decorations.colour} strength={s.decorations.strength} height={geo.minHeight} />
    ) : null;
  const stretch = wholeLink ? (
    <Link href={props.href!} className="eps-stretch" aria-label={p.headline}>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{p.headline}</span>
    </Link>
  ) : null;
  const cls = `eps eps--${layout} is-${size}${props.className ? ` ${props.className}` : ""}`;
  const common = { "data-testid": "promo-skin", "data-layout": layout, "data-size": size } as const;

  if (layout === "header_card") {
    const body = s.body ?? { colour: "#ffffff", tagColour: "#18181b" };
    return (
      <article {...common} className={cls} style={{ ...frame, background: body.colour, minHeight: geo.minHeight }} onClick={props.onOpen}>
        <style href="effy-promo-skin" precedence="default">{PROMO_SKIN_CSS}</style>
        <div className="eps-header" style={{ background: s.background.colour, padding: pad }}>
          {picture ? <Picture picture={picture} className="eps-fill" sizes={props.imageSizes} /> : null}
          {picture ? <Tint settings={s} /> : null}
          {decor}
          <Words p={p} s={s} label={label} supporting={false} style={{ maxWidth: `${geo.wordsWidth * 100}%` }} />
        </div>
        <div className="eps-body" style={{ padding: pad, paddingTop: pad / 1.5 }}>
          {p.code ? (
            <span className="eps-tag" style={{ color: body.tagColour, border: `1px solid ${rgba(body.tagColour, 0.25)}` }}>
              Code
            </span>
          ) : null}
          {s.supporting.show && p.supportingLine ? (
            <p className="eps-sub" style={text(s.supporting)}>
              {p.supportingLine}
            </p>
          ) : null}
          <div style={{ marginTop: "auto" }}>
            <Actions p={p} props={props} />
          </div>
        </div>
        {stretch}
      </article>
    );
  }

  if (layout === "picture_beside") {
    return (
      <article {...common} className={`${cls}${s.pictureSide === "start" ? "" : " is-end"}`} style={frame} onClick={props.onOpen}>
        <style href="effy-promo-skin" precedence="default">{PROMO_SKIN_CSS}</style>
        <Words p={p} s={s} label={label} style={{ flex: 1, padding: pad, justifyContent: "center" }}>
          <Actions p={p} props={props} />
        </Words>
        {picture ? (
          <div className="eps-side">
            <Picture picture={picture} fit={s.pictureFit ?? "cover"} sizes={props.imageSizes} />
          </div>
        ) : null}
        {stretch}
      </article>
    );
  }

  if (layout === "strip") {
    return (
      <article {...common} className={cls} style={{ ...frame, padding: `${pad / 2}px ${pad}px` }} onClick={props.onOpen}>
        <style href="effy-promo-skin" precedence="default">{PROMO_SKIN_CSS}</style>
        {picture ? (
          <div className="eps-thumb">
            <Picture picture={picture} sizes="48px" />
          </div>
        ) : null}
        <Words p={p} s={s} label={label} supporting={false} />
        <Actions p={p} props={props} />
        {stretch}
      </article>
    );
  }

  // panel, full_picture, tile: words over a colour or a tinted picture.
  const corner = layout === "full_picture" ? ` at-${s.textCorner ?? "bottom-start"}` : "";
  return (
    <article {...common} className={`${cls}${corner}`} style={{ ...frame, padding: pad }} onClick={props.onOpen}>
      <style href="effy-promo-skin" precedence="default">{PROMO_SKIN_CSS}</style>
      {picture ? <Picture picture={picture} className="eps-fill" sizes={props.imageSizes} /> : null}
      {picture ? <Tint settings={s} /> : null}
      {decor}
      <Words
        p={p}
        s={s}
        label={label}
        supporting={layout !== "tile"}
        style={{ maxWidth: `${geo.wordsWidth * 100}%`, justifyContent: layout === "panel" ? "center" : "flex-end" }}
      >
        <Actions p={p} props={props} />
        {p.terms && layout === "panel" && size === "large" ? (
          <p className="eps-note" style={{ color: s.supporting.colour }}>
            {p.terms}
          </p>
        ) : null}
      </Words>
      {stretch}
    </article>
  );
}
