import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { blockSubsidySat, HALVING_INTERVAL, subsidySamples } from "../data/specEconomic";

/**
 * Step plot of block subsidy vs height — Orange Paper §6.1 / economic model.
 */
export function SubsidyHalvingChart() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const maxH = HALVING_INTERVAL * 4;
    const data = subsidySamples(maxH, 500);
    const margin = { top: 28, right: 24, bottom: 44, left: 56 };
    const w = 820;
    const h = 280;
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const x = d3
      .scaleLinear()
      .domain([0, maxH])
      .range([0, iw]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.btc) ?? 50])
      .nice()
      .range([ih, 0]);

    const line = d3
      .line<(typeof data)[0]>()
      .x((d) => x(d.height))
      .y((d) => y(d.btc))
      .curve(d3.curveStepAfter);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `${Number(d) / 1000}k`))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text").attr("fill", "#94a3b8");
      })
      .append("text")
      .attr("x", iw / 2)
      .attr("y", 36)
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("block height");

    g.append("g")
      .call(d3.axisLeft(y).ticks(6))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text").attr("fill", "#94a3b8");
      })
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -44)
      .attr("x", -ih / 2)
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("subsidy (BTC)");

    for (let k = 1; k <= 4; k++) {
      const hx = k * HALVING_INTERVAL;
      g.append("line")
        .attr("x1", x(hx))
        .attr("x2", x(hx))
        .attr("y1", 0)
        .attr("y2", ih)
        .attr("stroke", "#78350f")
        .attr("stroke-dasharray", "4 4");
      g.append("text")
        .attr("x", x(hx) + 4)
        .attr("y", 14)
        .attr("font-size", "10px")
        .attr("fill", "#ea580c")
        .text(`H${k}`);
    }

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#c2410c")
      .attr("stroke-width", 2)
      .attr("d", line);

    g.selectAll("circle.halving")
      .data([0, 1, 2, 3, 4].map((k) => ({ k, h: k * HALVING_INTERVAL })))
      .join("circle")
      .attr("class", "halving")
      .attr("cx", (d) => x(d.h))
      .attr("cy", (d) => y(blockSubsidySat(d.h) / 1e8))
      .attr("r", 4)
      .attr("fill", "#fbbf24")
      .append("title")
      .text((d) => `height ${d.h}: ${blockSubsidySat(d.h) / 1e8} BTC`);

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  return (
    <figure>
      <svg ref={ref} width="100%" height={280} role="img" aria-label="Block subsidy halving chart" />
      <figcaption className="viz-caption">
        Step curve from the chart helper: <code>floor(INITIAL_SUBSIDY_SAT / 2**halvings)</code> per 210k blocks;
        subsidy is 0 once <code>halvings ≥ 64</code>. Vertical guides at each halving boundary (H1…H4 in this
        window). Aligns
        with Orange Paper §6.1 narrative; on-chain types may differ slightly from this visualization.
      </figcaption>
    </figure>
  );
}
