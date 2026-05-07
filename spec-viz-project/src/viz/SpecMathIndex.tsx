import katex from "katex";
import { useMemo } from "react";
import { getProtocolViewerBaseUrl, protocolHeadingHref } from "../data/commonsProtocolLink";
import { preprocessSpecMathLatex } from "../data/preprocessSpecMathLatex";
import { specSupplement } from "../data/loadSpecSupplement";
import { specViz } from "../data/loadSpecViz";

const SHOW = 120;

function renderKatex(latex: string): string {
  const processed = preprocessSpecMathLatex(latex);
  return katex.renderToString(processed, {
    displayMode: true,
    throwOnError: false,
    errorColor: "#f87171",
    strict: "ignore",
  });
}

function MathBlock({ latex }: { latex: string }) {
  const html = useMemo(() => renderKatex(latex), [latex]);
  return (
    <div
      className="math-katex-block"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Formula index: display-math blocks (`$$ … $$`) from PROTOCOL with nearest heading (extract). */
export function SpecMathIndex() {
  const rows = specSupplement.mathBlocks.slice(0, SHOW);
  const total = specSupplement.stats.displayMathBlockCount;

  return (
    <figure>
      <div className="math-index-wrap">
        <ul className="math-index-list">
          {rows.map((r, i) => {
            const src = r.latex ?? r.preview;
            const sectionHref = protocolHeadingHref(r.heading);
            return (
              <li key={`${r.line}-${i}`} className="math-index-entry">
                <header className="math-index-entry-header">
                  <div className="math-index-entry-lead">
                    <span className="math-index-line-badge">Line {r.line}</span>
                    <h3 className="math-index-title">
                      <a href={sectionHref} target="_blank" rel="noopener noreferrer">
                        {r.heading}
                      </a>
                    </h3>
                  </div>
                  <a
                    className="math-index-protocol-cta"
                    href={sectionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in PROTOCOL ↗
                  </a>
                </header>
                <div className="math-index-entry-body">
                  <MathBlock latex={src} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption className="viz-caption">
        Showing {rows.length} of {total} formulas from <code>{specViz.repoRelative.protocol}</code> (bundled
        extract). Section titles link to the same heading on{" "}
        <a href={getProtocolViewerBaseUrl()} target="_blank" rel="noopener noreferrer">
          the Bitcoin Commons PROTOCOL viewer
        </a>{" "}
        (GFM anchors). Wider formulas scroll inside the math strip. KaTeX normalizes{" "}
        <code>{"\\text{…}"}</code> underscores, <code>stack[|stack|-n]</code>, and primes.
      </figcaption>
    </figure>
  );
}
