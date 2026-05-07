import { specSupplement } from "./data/loadSpecSupplement";
import { SpecConstantsPanel } from "./viz/SpecConstantsPanel";
import { SpecMathIndex } from "./viz/SpecMathIndex";

function formatDatasetStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export default function ReferenceApp() {
  return (
    <div className="page">
      <nav className="spec-viz-crossnav" aria-label="Spec visualization pages">
        <a href="./index.html">← Charts &amp; maps</a>
        <div className="spec-viz-crossnav-onpage">
          <span className="spec-viz-crossnav-muted">On this page</span>
          <a href="#protocol-constants">Constants</a>
          <span className="spec-viz-crossnav-sep" aria-hidden="true">
            ·
          </span>
          <a href="#formula-index">Formula index</a>
        </div>
      </nav>

      <header className="hero">
        <h1>PROTOCOL reference</h1>
        <p>
          §4 constants and display-math; headings link to the{" "}
          <a href="../protocol.html">PROTOCOL viewer</a>.
        </p>
      </header>

      <section className="panel" id="protocol-constants">
        <h2>PROTOCOL constants (§4 + retarget timebase)</h2>
        <p className="lede">Named scalars from the early constants tables; cross-check the spec if values change.</p>
        <SpecConstantsPanel />
      </section>

      <section className="panel" id="formula-index">
        <h2>Formula index</h2>
        <p className="lede">
          <code>$$ … $$</code> blocks with the nearest preceding heading (first rows shown here; the bundle
          includes the full list).
        </p>
        <SpecMathIndex />
      </section>

      <footer className="foot">
        <p>
          Extract timestamp:{" "}
          <time dateTime={specSupplement.generatedAt}>{formatDatasetStamp(specSupplement.generatedAt)}</time>.
          Return to <a href="./index.html">charts &amp; maps</a>.
        </p>
      </footer>
    </div>
  );
}
