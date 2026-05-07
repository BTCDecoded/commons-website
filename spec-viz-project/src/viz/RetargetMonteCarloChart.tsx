import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import { clampedTimespanRatio, T_EXPECTED_SEC } from "../data/specRetarget";

const N = 6000;

/**
 * Illustrative distribution of clamped τ / T_expected when raw timespans are i.i.d. uniform on [0, 6T].
 * Not chain data — shows how often the §7.1 clamp hits the ¼ and 4× rails.
 */
export function RetargetMonteCarloChart() {
  const ref = useRef<SVGSVGElement | null>(null);

  const ratios = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 6 * T_EXPECTED_SEC;
      out.push(clampedTimespanRatio(u));
    }
    return out;
  }, []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const margin = { top: 22, right: 16, bottom: 44, left: 48 };
    const w = 820;
    const h = 260;
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const bins = d3.bin().domain([0, 4.2]).thresholds(28)(ratios);

    const x = d3
      .scaleLinear()
      .domain([0, 4.2])
      .range([0, iw]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (b) => b.length) ?? 1])
      .nice()
      .range([ih, 0]);

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("x", (d) => x(d.x0 ?? 0) + 1)
      .attr("width", (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 2))
      .attr("y", (d) => y(d.length))
      .attr("height", (d) => ih - y(d.length))
      .attr("fill", "#6366f1")
      .attr("opacity", 0.85);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(8))
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
      .text("ClampTime(raw) / T_expected");

    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((ga) => {
        ga.selectAll(".domain, .tick line").attr("stroke", "#64748b");
        ga.selectAll("text").attr("fill", "#94a3b8");
      })
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -36)
      .attr("x", -ih / 2)
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("count");

    for (const v of [0.25, 4]) {
      g.append("line")
        .attr("x1", x(v))
        .attr("x2", x(v))
        .attr("y1", 0)
        .attr("y2", ih)
        .attr("stroke", "#f472b6")
        .attr("stroke-dasharray", "3 4")
        .attr("opacity", 0.7);
    }

    return () => {
      svg.selectAll("*").remove();
    };
  }, [ratios]);

  return (
    <figure>
      <svg ref={ref} width="100%" role="img" aria-label="Monte Carlo clamped retarget ratio" />
      <figcaption className="viz-caption">
        Toy model: {N.toLocaleString()} draws with raw period length uniform on [0, 6·
        <code>T_expected</code>]. Mass piles at 0.25 and 4 when the clamp binds. Pink guides at the clamp
        rails (§7.1).
      </figcaption>
    </figure>
  );
}
