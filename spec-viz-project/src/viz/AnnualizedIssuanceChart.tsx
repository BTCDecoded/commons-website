import * as d3 from "d3";
import { useEffect, useRef } from "react";
import {
  annualizedIssuanceBtc,
  blocksPerYear,
  HALVING_INTERVAL,
} from "../data/specEconomic";

/** Coinbase-only annualized issuance (BTC/year) from §6.1 subsidy × blocks/year at 600 s spacing. */
export function AnnualizedIssuanceChart() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const maxH = HALVING_INTERVAL * 5;
    const step = 400;
    const data: { height: number; btcYr: number }[] = [];
    for (let h = 0; h <= maxH; h += step) {
      data.push({ height: h, btcYr: annualizedIssuanceBtc(h) });
    }

    const margin = { top: 28, right: 24, bottom: 44, left: 64 };
    const w = 820;
    const h = 280;
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const x = d3.scaleLinear().domain([0, maxH]).range([0, iw]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.btcYr) ?? 1])
      .nice()
      .range([ih, 0]);

    const line = d3
      .line<(typeof data)[0]>()
      .x((d) => x(d.height))
      .y((d) => y(d.btcYr))
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
      .attr("y", -52)
      .attr("x", -ih / 2)
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("BTC / year (coinbase only)");

    for (let k = 1; k <= 5; k++) {
      const hx = k * HALVING_INTERVAL;
      g.append("line")
        .attr("x1", x(hx))
        .attr("x2", x(hx))
        .attr("y1", 0)
        .attr("y2", ih)
        .attr("stroke", "#334155")
        .attr("stroke-dasharray", "4 4");
    }

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  const bpy = blocksPerYear();

  return (
    <figure>
      <svg ref={ref} width="100%" role="img" aria-label="Annualized coinbase issuance" />
      <figcaption className="viz-caption">
        Step curve: subsidy at height (§6.1) × {bpy.toFixed(2)} blocks/year (365.25-day year,{" "}
        <code>T_block</code> = 600 s). Transaction fees are excluded.
      </figcaption>
    </figure>
  );
}
