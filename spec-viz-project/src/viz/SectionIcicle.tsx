import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { truncateFriendlyHeading } from "../data/sectionHeadingLookup";
import { specViz, type OutlineNode } from "../data/loadSpecViz";
import { getOrangePaperForOutlineViz } from "../data/specOutlineFilter";

/**
 * Same outline as the sunburst — rectilinear partition by line count per heading.
 */
export function SectionIcicle() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const data = structuredClone(getOrangePaperForOutlineViz(specViz.orangePaper)) as OutlineNode;
    const root = d3
      .hierarchy<OutlineNode>(data)
      .sum((d) => (d.children?.length ? 0 : (d.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const w = 820;
    const layer = 36;
    const h = (root.height + 1) * layer + 48;

    d3.partition<OutlineNode>().size([w - 32, root.height + 1])(root);

    type PNode = d3.HierarchyRectangularNode<OutlineNode>;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const color = d3.scaleOrdinal<string, string>([
      "#0f172a",
      "#ea580c",
      "#2563eb",
      "#64748b",
      "#16a34a",
      "#a855f7",
    ]);

    const g = svg.append("g").attr("transform", "translate(16, 16)");

    const nodes = root.descendants().filter((d) => d.depth > 0) as PNode[];

    g.selectAll("rect")
      .data(nodes)
      .join("rect")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0 * layer)
      .attr("width", (d) => Math.max(d.x1 - d.x0, 1))
      .attr("height", (d) => Math.max((d.y1 - d.y0) * layer - 2, 4))
      .attr("fill", (d) => color(String(d.depth)))
      .attr("fill-opacity", (d) => 0.35 + (d.depth / 8) * 0.45)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .each(function (d) {
        d3.select(this).append("title").text(`${d.data.name} — ${d.value ?? 0} lines`);
      });

    g.selectAll("text.lbl")
      .data(nodes.filter((d) => d.x1 - d.x0 > 56))
      .join("text")
      .attr("class", "lbl")
      .attr("x", (d) => d.x0 + 6)
      .attr("y", (d) => d.y0 * layer + layer / 2 + 4)
      .attr("font-size", "11px")
      .attr("fill", "#0f172a")
      .text((d) => {
        const max = Math.floor((d.x1 - d.x0) / 7);
        return truncateFriendlyHeading(d.data.name, Math.max(4, max));
      });

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  return (
    <figure>
      <svg ref={ref} width="100%" height={320} role="img" aria-label="Section icicle" />
      <figcaption className="viz-caption">
        Same filtered outline as the sunburst (see sunburst caption for <code>?outline=full</code>) —
        nested strips sized by lines under each Markdown heading.
      </figcaption>
    </figure>
  );
}
