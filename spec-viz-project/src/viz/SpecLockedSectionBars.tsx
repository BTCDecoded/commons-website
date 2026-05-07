import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import { buildSectionIdToTitle, sectionIdToVizLabel } from "../data/sectionHeadingLookup";
import { specViz } from "../data/loadSpecViz";

/** Horizontal bars: `#[spec_locked("§…")]` reference counts in blvm-consensus (extracted). */
export function SpecLockedSectionBars() {
  const ref = useRef<SVGSVGElement | null>(null);
  const idToTitle = useMemo(() => buildSectionIdToTitle(specViz.orangePaper), []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const rows = specViz.specLocked.bySection.slice(0, 22);
    if (rows.length === 0) return;

    const w = 820;
    const h = Math.max(120, rows.length * 22 + 48);
    const margin = { top: 12, right: 40, bottom: 16, left: 200 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (d) => d.count) ?? 1])
      .nice()
      .range([0, iw]);
    const y = d3
      .scaleBand()
      .domain(rows.map((d) => d.section))
      .range([0, ih])
      .padding(0.15);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.selectAll("rect")
      .data(rows)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.section)!)
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.count))
      .attr("fill", "#ea580c")
      .attr("stroke", "#fb923c")
      .attr("rx", 2);

    g.selectAll("text.c")
      .data(rows)
      .join("text")
      .attr("class", "c")
      .attr("x", (d) => x(d.count) + 4)
      .attr("y", (d) => (y(d.section) ?? 0) + y.bandwidth() / 2 + 4)
      .attr("font-size", "10px")
      .attr("fill", "#94a3b8")
      .text((d) => d.count);

    g.append("g")
      .call(d3.axisLeft(y))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text")
          .attr("font-size", "10px")
          .attr("fill", "#cbd5e1")
          .text((d) => sectionIdToVizLabel(String(d), idToTitle, 32));
      });

    return () => {
      svg.selectAll("*").remove();
    };
  }, [idToTitle]);

  return (
    <figure>
      <svg ref={ref} width="100%" height={560} role="img" aria-label="Spec locked by section" />
      <figcaption className="viz-caption">
        Parsed from <code>blvm-consensus/src/**/*.rs</code>: every <code>#[spec_locked(&quot;…&quot;)]</code>{" "}
        occurrence increments that § id (multiple attributes in one file each count). Shows the{" "}
        <strong>22</strong> § with the highest totals in the bundled extract; y-axis uses short heading titles
        from the merged PROTOCOL+ARCHITECTURE outline (no leading numbers).
      </figcaption>
    </figure>
  );
}
