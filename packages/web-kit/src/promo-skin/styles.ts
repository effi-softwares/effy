/**
 * 095 — the renderer's layout geometry, as one stylesheet both apps receive through React 19's
 * `<style href precedence>` (hoisted and de-duplicated, so a page of twenty skins carries it once).
 *
 * ⚠ NO TOKEN, NO TAILWIND. A skin's colours are its own (constitution v3.6.0); everything that is a colour
 * is an inline style from the skin's settings. This file is shape only, so the skin looks the same in
 * back-office (console identity) and on the website (storefront identity). `PromoSkin.test.tsx` holds it.
 */
export const PROMO_SKIN_CSS = `
.eps{position:relative;isolation:isolate;overflow:hidden;display:flex;width:100%;box-sizing:border-box;container-type:inline-size;text-align:start}
.eps *{box-sizing:border-box}
.eps-fill{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}
.eps-tint{position:absolute;inset:0;z-index:-1}
.eps-decor{position:absolute;inset:0;z-index:-1;pointer-events:none}
.eps-bubble{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:9999px}
.eps-words{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0}
.eps-label{margin:0;text-transform:uppercase;font-weight:600}
.eps-head,.eps-sub{margin:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.eps-head{line-height:1.15;letter-spacing:-0.01em}
.eps-sub{line-height:1.4}
.eps-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
.eps-chip{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:6px;font-family:var(--font-mono,ui-monospace,monospace);font-weight:600;letter-spacing:.02em}
.eps-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:8px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;border:1px solid transparent;background:none;white-space:nowrap}
.eps-btn.is-link{height:auto;padding:0;border:0}
.eps-btn:focus-visible,.eps-stretch:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.eps-btn svg{width:16px;height:16px}
.eps-stretch::after{content:"";position:absolute;inset:0;z-index:1}
.eps-actions .eps-btn{position:relative;z-index:2}
.eps-note{margin:0;font-size:12px;opacity:.85}
/* header card */
.eps--header_card{flex-direction:column}
.eps-header{position:relative;isolation:isolate;overflow:hidden;aspect-ratio:16/9;display:flex}
.eps-body{display:flex;flex-direction:column;align-items:flex-start;gap:8px;flex:1}
.eps-tag{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:9999px;font-size:12px;font-weight:600}
/* full picture */
.eps--full_picture{align-items:flex-end}
.eps--full_picture.at-top-start{align-items:flex-start}
.eps--full_picture.at-center{align-items:center;justify-content:center}
.eps--full_picture.at-bottom-end{justify-content:flex-end}
/* picture beside */
.eps--picture_beside{flex-direction:row}
.eps--picture_beside.is-end{flex-direction:row-reverse}
.eps-side{position:relative;flex:0 0 45%;overflow:hidden}
.eps-side img{position:absolute;inset:0;width:100%;height:100%}
@container (max-width: 420px){.eps--picture_beside.is-large{flex-direction:column}.eps--picture_beside.is-large .eps-side{flex-basis:auto;aspect-ratio:16/9}}
/* tile */
.eps--tile{align-items:flex-end}
/* strip */
.eps--strip{flex-direction:row;align-items:center;gap:12px}
.eps--strip .eps-words{flex-direction:row;align-items:center;flex:1}
.eps--strip .eps-actions{margin-top:0;margin-left:auto}
.eps-thumb{position:relative;flex:0 0 auto;width:48px;height:48px;border-radius:6px;overflow:hidden}
.eps-thumb img{width:100%;height:100%}
`;
