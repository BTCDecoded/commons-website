import katex from "katex";
import { useMemo } from "react";
import { preprocessSpecMathLatex } from "../data/preprocessSpecMathLatex";

type MathPart = { kind: "text"; text: string } | { kind: "math"; latex: string; display: boolean };

function mergeTextParts(parts: MathPart[]): MathPart[] {
  const r: MathPart[] = [];
  for (const p of parts) {
    const last = r[r.length - 1];
    if (p.kind === "text" && last?.kind === "text") last.text += p.text;
    else r.push(p.kind === "text" ? { kind: "text", text: p.text } : p);
  }
  return r;
}

/** Split on single `$…$` (not `$$`). */
function splitInlineMath(s: string): MathPart[] {
  const out: MathPart[] = [];
  let i = 0;
  while (i < s.length) {
    const dollar = s.indexOf("$", i);
    if (dollar === -1) {
      if (i < s.length) out.push({ kind: "text", text: s.slice(i) });
      break;
    }
    if (dollar > i) out.push({ kind: "text", text: s.slice(i, dollar) });
    if (s[dollar + 1] === "$") {
      out.push({ kind: "text", text: "$" });
      i = dollar + 1;
      continue;
    }
    const close = s.indexOf("$", dollar + 1);
    if (close === -1) {
      out.push({ kind: "text", text: s.slice(dollar) });
      break;
    }
    const inner = s.slice(dollar + 1, close).trim();
    if (inner.length > 0) out.push({ kind: "math", latex: inner, display: false });
    i = close + 1;
  }
  return out;
}

/** Display `$$…$$` then inline `$…$` within text runs. */
function splitPreviewToParts(raw: string): MathPart[] {
  const merged: MathPart[] = [];
  let i = 0;
  while (i < raw.length) {
    const d = raw.indexOf("$$", i);
    if (d === -1) {
      merged.push(...splitInlineMath(raw.slice(i)));
      break;
    }
    if (d > i) merged.push(...splitInlineMath(raw.slice(i, d)));
    const d2 = raw.indexOf("$$", d + 2);
    if (d2 === -1) {
      merged.push({ kind: "text", text: raw.slice(d) });
      break;
    }
    merged.push({ kind: "math", latex: raw.slice(d + 2, d2).trim(), display: true });
    i = d2 + 2;
  }
  return mergeTextParts(merged);
}

function renderKatex(latex: string, display: boolean): string {
  const processed = preprocessSpecMathLatex(latex);
  return katex.renderToString(processed, {
    displayMode: display,
    throwOnError: false,
    errorColor: "#f87171",
    strict: "ignore",
  });
}

/** Prose preview with KaTeX for `$$…$$` and `$…$` segments (Orange Paper extract). */
export function SunburstPreviewBody({ text }: { text: string }) {
  const parts = useMemo(() => splitPreviewToParts(text), [text]);
  return (
    <div className="sunburst-preview-text sunburst-preview-rich">
      {parts.map((p, idx) =>
        p.kind === "text" ? (
          <span key={idx}>{p.text}</span>
        ) : p.latex.trim() === "" ? null : (
          <span
            key={idx}
            className={p.display ? "sunburst-preview-math-block" : "sunburst-preview-math-inline"}
            dangerouslySetInnerHTML={{ __html: renderKatex(p.latex, p.display) }}
          />
        ),
      )}
    </div>
  );
}
