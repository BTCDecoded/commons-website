import { AnnualizedIssuanceChart } from "./viz/AnnualizedIssuanceChart";
import { BipActivationStrip } from "./viz/BipActivationStrip";
import { CompositionGraphExplorer } from "./viz/CompositionGraph";
import { CumulativeSupplyChart } from "./viz/CumulativeSupplyChart";
import { ModuleSectionHeatmap } from "./viz/ModuleSectionHeatmap";
import { RetargetClampChart } from "./viz/RetargetClampChart";
import { RetargetMonteCarloChart } from "./viz/RetargetMonteCarloChart";
import { SectionChordDiagram } from "./viz/SectionChordDiagram";
import { SectionSunburst } from "./viz/SectionSunburst";
import { SpecLockNetwork } from "./viz/SpecLockNetwork";
import { SpecLockedSectionBars } from "./viz/SpecLockedSectionBars";
import { SubsidyHalvingChart } from "./viz/SubsidyHalvingChart";

export default function App() {
  return (
    <div className="page">
      <nav className="spec-viz-crossnav" aria-label="Spec visualization pages">
        <span className="spec-viz-crossnav-current">Charts &amp; maps</span>
        <a href="./reference.html">PROTOCOL constants &amp; formula index →</a>
      </nav>

      <header className="hero">
        <h1>Orange Paper ↔ consensus code</h1>
        <p>
          Spec outlines and <code>spec_locked</code> coverage bundled when this site is built.{" "}
          <a href="./reference.html">Constants &amp; formula index</a>.
        </p>
      </header>

      <section className="panel">
        <h2>Spec outline sunburst</h2>
        <p className="lede explain-one-liner">
          <strong>Simply:</strong> Each slice is a heading; slice size = how many prose lines live under that
          heading (not counting the heading line). Center = BLVM; first big ring = the two spec files.
        </p>
        <p className="lede">
          <code>PROTOCOL.md</code> + <code>ARCHITECTURE.md</code> heading tree; arc weight = non-heading
          lines under each section.           Framing, system model, security-property proofs, arch gloss, and wrap-up are omitted by default (
          <code>?outline=full</code> restores everything; policy in <code>src/data/specOutlineFilter.ts</code>).
        </p>
        <SectionSunburst />
      </section>

      <section className="panel">
        <h2>Soft-fork / rule deployments (mainnet heights)</h2>
        <p className="lede">
          Same mainnet heights as in <code>PROTOCOL.md</code> (§5.4 BIP rules and §5.1 script-flag
          activations).
        </p>
        <BipActivationStrip />
      </section>

      <section className="panel">
        <h2>Section co-occurrence chord</h2>
        <p className="lede explain-one-liner">
          <strong>Simply:</strong> Around the circle = how “busy” each spec section is in the codebase;
          ribbons = “these two sections are both cited in the same Rust file.”
        </p>
        <p className="lede">
          Diagonal = total <code>spec_locked</code> attributes per § (same counting rule as the bar chart).
          Ribbons = how many distinct <code>.rs</code> files cite <em>both</em> § (file-level co-occurrence).
          Only the <strong>top 14</strong> § by global volume enter this matrix; <strong>§5.4.6</strong> is
          omitted in the extract to reduce clutter.
        </p>
        <SectionChordDiagram />
      </section>

      <section className="panel">
        <h2>
          <code>spec_locked</code> by Orange Paper section
        </h2>
        <p className="lede">
          Count of attribute occurrences per section id in Rust sources (see{" "}
          <code>src/data/generated/specViz.data.json</code>).
        </p>
        <SpecLockedSectionBars />
      </section>

      <section className="panel">
        <h2>Module × section heatmap</h2>
        <p className="lede">
          Same <code>byModule</code> × § counts as the extract, but rows/columns are chosen so the grid is
          readable: see the figure caption for coverage rules (not a fixed “global top §” slice).
        </p>
        <ModuleSectionHeatmap />
      </section>

      <section className="panel">
        <h2>Module ↔ section force graph</h2>
        <p className="lede">
          Bipartite layout: <code>economic</code> / <code>taproot</code> stay visible when present (pinned),
          other rows by total <code>spec_locked</code> count; § nodes are the strongest links to{" "}
          <em>those</em> modules — not the same column set as the heatmap. Edge thickness = pair count in the
          extract.
        </p>
        <SpecLockNetwork />
      </section>

      <section className="panel composition-panel">
        <h2>ConnectBlock composition (curated)</h2>
        <p className="lede">
          Decomposition of <code>connect_block</code> / ConnectBlock into primitives — edges reflect the
          real validation stack in <code>blvm-consensus</code>, not random weights.
        </p>
        <CompositionGraphExplorer />
      </section>

      <section className="panel">
        <h2>Block subsidy (halving steps)</h2>
        <p className="lede">Consensus subsidy schedule (§6.1).</p>
        <SubsidyHalvingChart />
      </section>

      <section className="panel">
        <h2>Annualized coinbase issuance</h2>
        <p className="lede">
          Subsidy per block × blocks per year at 600 s spacing (fees excluded); same halving schedule as
          above.
        </p>
        <AnnualizedIssuanceChart />
      </section>

      <section className="panel">
        <h2>Cumulative issued supply</h2>
        <p className="lede">Summed coinbase subsidies vs height toward the ~21M BTC cap (§6.2).</p>
        <CumulativeSupplyChart />
      </section>

      <section className="panel">
        <h2>Difficulty retarget time clamp</h2>
        <p className="lede">
          How measured two-week timespan is bounded before entering <code>GetNextWorkRequired</code> (§7.1).
        </p>
        <RetargetClampChart />
      </section>

      <section className="panel">
        <h2>Retarget clamp — toy distribution</h2>
        <p className="lede">
          Monte Carlo illustration when raw timespans are uniform — not observed chain data. Shows clamp
          rails at ¼× and 4×.
        </p>
        <RetargetMonteCarloChart />
      </section>

      <footer className="foot">
        <p>
          Charts use outlines and <code>spec_locked</code> counts baked into this bundle at deploy time. The
          ConnectBlock composition view is hand-authored (not from the automated extract).{" "}
          <a href="./reference.html">Constants &amp; formula index →</a>
        </p>
      </footer>
    </div>
  );
}
