import { protocolScalars } from "../data/specProtocolConstants";
import { specViz } from "../data/loadSpecViz";

export function SpecConstantsPanel() {
  return (
    <figure>
      <div className="constants-grid" role="list">
        {protocolScalars.map((row) => (
          <div key={row.symbol} className="constants-row" role="listitem">
            <span className="constants-sym">
              <code>{row.symbol}</code>
            </span>
            <span className="constants-val">{row.displayValue}</span>
            <span className="constants-ref">
              <code>{row.specRef}</code>
            </span>
            <span className="constants-note">{row.note}</span>
          </div>
        ))}
      </div>
      <figcaption className="viz-caption">
        Named scalars from <code>{specViz.repoRelative.protocol}</code> §4 (and{" "}
        <code>T_expected</code> from §7.1). Values are what the prose states; they are not recomputed here.
      </figcaption>
    </figure>
  );
}
