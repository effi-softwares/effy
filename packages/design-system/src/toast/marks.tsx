/**
 * Effy's toast marks (spec FR-004, FR-015): one ring for every kind, with a glyph drawn inside it. While a toast is in
 * progress the ring has a gap and turns; when the result comes, the gap closes and the result's glyph draws in.
 * Colours come from the stylesheet (`currentColor`), never from here.
 */
import type { Kind } from "./types";

const GLYPHS: Record<Exclude<Kind, "loading">, readonly string[]> = {
  success: ["M8.25 12.25l2.5 2.5 5-5.25"],
  error: ["M9.5 9.5l5 5", "M14.5 9.5l-5 5"],
  warning: ["M12 7.75v5", "M12 16.25h.01"],
  info: ["M12 11.25v5", "M12 7.75h.01"],
};

export function Mark({ kind }: { kind: Kind }) {
  return (
    <svg className="ef-toast-mark" viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false">
      <circle className="ef-toast-ring" cx={12} cy={12} r={9.25} pathLength={1} />
      {kind === "loading" ? null : (
        <g className="ef-toast-glyph" key={kind}>
          {GLYPHS[kind].map((d) => (
            <path key={d} d={d} pathLength={1} />
          ))}
        </g>
      )}
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}
