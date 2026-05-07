import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { cumulativeSupplyBtc, MAX_SUPPLY_BTC } from "../data/specEconomic";

export function CumulativeSupplyChart() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const maxH = 2_100_000;
    const data = cumulativeSupplyBtc(maxH, 12_000);
    const w = 820;
    const h = 300;
    const margin = { top: 28, right: 32, bottom: 48, left: 56 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const x = d3.scaleLinear().domain([0, maxH]).range([0, iw]);
    const y = d3
      .scaleLinear()
      .domain([0, MAX_SUPPLY_BTC * 1.001])
      .range([ih, 0]);

    const line = d3
      .line<(typeof data)[0]>()
      .x((d) => x(d.height))
      .y((d) => y(d.btc))
      .curve(d3.curveMonotoneX);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#c2410c")
      .attr("stroke-width", 2)
      .attr("d", line);

    g.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", y(MAX_SUPPLY_BTC))
      .attr("y2", y(MAX_SUPPLY_BTC))
      .attr("stroke", "#16a34a")
      .attr("stroke-dasharray", "6 4");

    g.append("text")
      .attr("x", iw - 4)
      .attr("y", y(MAX_SUPPLY_BTC) - 6)
      .attr("text-anchor", "end")
      .attr("font-size", "10px")
      .attr("fill", "#15803d")
      .text(`≈ ${MAX_SUPPLY_BTC.toLocaleString()} BTC cap`);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${Number(d) / 1e6}M`))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text").attr("fill", "#94a3b8");
      })
      .append("text")
      .attr("x", iw / 2)
      .attr("y", 40)
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
      .text("cumulative issued (BTC)");

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  return (
    <figure>
      <svg ref={ref} width="100%" height={300} role="img" aria-label="Cumulative supply" />
      <figcaption className="viz-caption">
        Sum of per-block subsidies (§6.1) — curve approaches the ~21M BTC asymptote (§6.2). Sampling
        every 12k blocks for performance.
      </figcaption>
    </figure>
  );
}
