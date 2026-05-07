import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import { buildSectionIdToTitle, formatChordSectorLabel } from "../data/sectionHeadingLookup";
import { specViz } from "../data/loadSpecViz";

/**
 * Chord matrix: top Orange Paper section ids by `spec_locked` volume + co-occurrence in same file.
 */
export function SectionChordDiagram() {
  const ref = useRef<SVGSVGElement | null>(null);
  const idToTitle = useMemo(() => buildSectionIdToTitle(specViz.orangePaper), []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const labels = specViz.specLocked.cooccurrenceTopSections;
    const matrix = specViz.specLocked.cooccurrenceMatrix;
    if (!labels.length || !matrix.length) {
      svg.attr("viewBox", "0 0 400 80");
      svg
        .append("text")
        .attr("x", 20)
        .attr("y", 44)
        .attr("fill", "#94a3b8")
        .text("No spec_locked data in this bundle.");
      return () => svg.selectAll("*").remove();
    }

    const size = 460;
    const outerRadius = Math.min(size, size) / 2 - 36;
    const innerRadius = outerRadius - 18;

    const chordGen = d3.chord().padAngle(0.04).sortSubgroups(d3.descending);
    const chords = chordGen(matrix);
    const groups = chords.groups;

    const arc = d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius);

    const ribbon = d3.ribbon().radius(innerRadius - 2);

    const color = d3.scaleOrdinal<string, string>(d3.schemeTableau10);

    svg.attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`);

    const g = svg.append("g");

    const group = g
      .append("g")
      .selectAll("g")
      .data(groups)
      .join("g");

    group
      .append("path")
      .attr("fill", (d) => color(String(d.index)))
      .attr("stroke", "#0f172a")
      .attr("d", arc)
      .append("title")
      .text((d) => {
        const id = labels[d.index] ?? String(d.index);
        const title = idToTitle.get(id);
        const line = formatChordSectorLabel(id, title, 72);
        return `${line}\nDiagonal: total spec_locked annotations for this section across all consensus .rs files.`;
      });

    group.each(function (d) {
      const id = labels[d.index] ?? "";
      const title = idToTitle.get(id);
      const a = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
      const r = outerRadius + 14;
      const anchor = (a + Math.PI / 2) % (2 * Math.PI) < Math.PI ? "start" : "end";
      const g = d3
        .select(this)
        .append("g")
        .attr("transform", `translate(${Math.cos(a) * r},${Math.sin(a) * r})`)
        .attr("text-anchor", anchor);

      g.append("text")
        .attr("dy", "0.35em")
        .attr("font-size", "8px")
        .attr("font-weight", "500")
        .attr("fill", "#e2e8f0")
        .text(formatChordSectorLabel(id, title, 44));
    });

    g.append("g")
      .attr("fill-opacity", 0.5)
      .selectAll("path")
      .data(chords)
      .join("path")
      .attr("fill", (d) => color(String(d.source.index)))
      .attr("d", (d) => (ribbon as unknown as (x: d3.Chord) => string | null)(d) ?? "")
      .append("title")
      .text((d) => {
        const a = labels[d.source.index];
        const b = labels[d.target.index];
        const ta = idToTitle.get(a);
        const tb = idToTitle.get(b);
        const n = Math.round(d.source.value);
        if (d.source.index === d.target.index) {
          return `${formatChordSectorLabel(a, ta, 80)}\nTotal spec_locked annotations for this section: ${n}.`;
        }
        return [
          `Co-occurrence: ${n} Rust file(s) under blvm-consensus/src cite both ${formatChordSectorLabel(a, ta, 72)} and ${formatChordSectorLabel(b, tb, 72)} (same file).`,
          `Ribbon width = that file count (not how many annotations).`,
        ].join("\n");
      });

    return () => {
      svg.selectAll("*").remove();
    };
  }, [idToTitle]);

  return (
    <figure>
      <svg ref={ref} width="100%" height={460} role="img" aria-label="Section chord diagram" />
      <figcaption className="viz-caption">
        <strong>TL;DR:</strong> ring segments = per-§ annotation volume; ribbons = “same Rust file cites both
        §.” Labels use <code>id · title</code>; §5.3 / §7.2 use distinct display names when headings repeat.
        <strong> Diagonal</strong> (matrix diagonal / self-ribbon): same per-§ total as in{" "}
        <code>specViz.specLocked.bySection</code> as the bar chart — but this diagram only includes the{" "}
        <strong>top {specViz.specLocked.cooccurrenceTopSections.length} §</strong> by that global total; the
        bar chart shows the top 22. <strong>Ribbons</strong> (off-diagonal): count of distinct{" "}
        <code>.rs</code> files under <code>blvm-consensus/src</code> that contain at least one{" "}
        <code>spec_locked</code> for §A and at least one for §B (file-level co-occurrence, not line proximity).
        Extract omits <strong>§5.4.6</strong> from this top list so the ring stays legible.
      </figcaption>
    </figure>
  );
}
