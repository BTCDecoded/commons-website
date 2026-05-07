import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { activationAxisMax, mainnetActivations, mainnetEraBands } from "../data/specActivations";
import { specViz } from "../data/loadSpecViz";

/** Pixel half-width estimate for 9px proportional font (avoids measuring DOM). */
function estimateLabelHalfWidth(label: string): number {
  return Math.min(150, Math.max(28, label.length * 4.9)) / 2;
}

/**
 * Greedy lanes: markers sorted by x; assign lowest lane that does not overlap prior labels on that lane.
 */
function assignLabelLanes(
  items: { height: number; label: string; i: number }[],
  x: d3.ScaleLinear<number, number>,
): number[] {
  const lanes = new Array(items.length).fill(0);
  const byX = [...items].sort((a, b) => a.height - b.height);
  const placed: { x: number; halfW: number; lane: number }[] = [];

  for (const it of byX) {
    const xi = x(it.height);
    const halfW = estimateLabelHalfWidth(it.label);
    let lane = 0;
    for (;;) {
      const clash = placed.some(
        (p) =>
          p.lane === lane && Math.abs(p.x - xi) < p.halfW + halfW + 10,
      );
      if (!clash) break;
      lane++;
    }
    placed.push({ x: xi, halfW, lane });
    lanes[it.i] = lane;
  }
  return lanes;
}

export function BipActivationStrip() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const svg = d3.select(el);
    svg.selectAll("*").remove();

    const w = 820;
    const margin = { top: 28, right: 16, bottom: 40, left: 16 };
    const iw = w - margin.left - margin.right;

    const indexed = mainnetActivations.map((d, i) => ({ height: d.height, label: d.label, i }));
    const x = d3.scaleLinear().domain([0, activationAxisMax]).range([0, iw]);
    const lanes = assignLabelLanes(indexed, x);
    const maxLane = d3.max(lanes) ?? 0;
    const lanePitch = 15;

    /** Extra top margin so stacked labels (negative local y) stay inside the viewBox. */
    margin.top += maxLane * lanePitch;

    const lineY = 40;
    const axisY = lineY + 14;
    const captionY = axisY + 28;
    const h = margin.top + captionY + 20;

    el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    el.setAttribute("height", String(h));

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const bandTop = 6;
    const bandBottom = axisY + 22;
    g.selectAll("rect.era")
      .data(mainnetEraBands)
      .join("rect")
      .attr("class", "era")
      .attr("x", (d) => x(d.fromHeight))
      .attr("width", (d) => Math.max(0, x(d.toHeight) - x(d.fromHeight)))
      .attr("y", bandTop)
      .attr("height", bandBottom - bandTop)
      .attr("fill", (d) => d.fill)
      .attr("stroke", "none");

    g.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", lineY)
      .attr("y2", lineY)
      .attr("stroke", "#475569")
      .attr("stroke-width", 2);

    g.append("g")
      .attr("transform", `translate(0, ${axisY})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${Number(d) / 1000}k`))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text").attr("fill", "#94a3b8");
      });

    g.append("text")
      .attr("x", iw / 2)
      .attr("y", captionY)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text(`mainnet block height (${specViz.repoRelative.protocol})`);

    const dots = g
      .selectAll("g.m")
      .data(mainnetActivations.map((d, i) => ({ d, i })))
      .join("g")
      .attr("class", "m")
      .attr("transform", (row) => `translate(${x(row.d.height)}, ${lineY})`);

    dots
      .append("circle")
      .attr("r", 7)
      .attr("fill", (row) => row.d.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .append("title")
      .text((row) => `${row.d.label} @ ${row.d.height}`);

    dots
      .append("text")
      .attr("y", (row) => -10 - lanes[row.i] * lanePitch)
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#cbd5e1")
      .text((row) => row.d.label);

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  return (
    <figure>
      <svg ref={ref} width="100%" role="img" aria-label="BIP activation strip" />
      <figcaption className="viz-caption">
        Shaded bands: pre-SegWit, SegWit, and Taproot eras by mainnet height (same SegWit/Taproot cutovers
        as the markers). Heights match the Orange Paper (<code>{specViz.repoRelative.protocol}</code>, §5.4
        and script-flag activations in §5.1). Labels stack when markers are close on the axis.
      </figcaption>
    </figure>
  );
}
