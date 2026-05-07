import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { clampTimeSec, T_EXPECTED_SEC } from "../data/specRetarget";
import { specViz } from "../data/loadSpecViz";

/**
 * Piecewise-linear clamp: raw difficulty-period timespan vs value fed into the retarget ratio (§7.1).
 */
export function RetargetClampChart() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const margin = { top: 28, right: 24, bottom: 48, left: 56 };
    const w = 820;
    const h = 300;
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const xMax = 5;
    const pts: { x: number; yRaw: number; yClamp: number }[] = [];
    for (let i = 0; i <= 200; i++) {
      const xr = (i / 200) * xMax;
      const rawSec = xr * T_EXPECTED_SEC;
      pts.push({
        x: xr,
        yRaw: xr,
        yClamp: clampTimeSec(rawSec) / T_EXPECTED_SEC,
      });
    }

    const x = d3.scaleLinear().domain([0, xMax]).range([0, iw]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(4.2, d3.max(pts, (d) => d.yClamp) ?? 4)])
      .nice()
      .range([ih, 0]);

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6))
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
      .text("raw period timespan / T_expected");

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
      .text("ClampTime(·) / T_expected");

    const idLine = d3
      .line<(typeof pts)[0]>()
      .x((d) => x(d.x))
      .y((d) => y(d.yRaw));

    const clampLine = d3
      .line<(typeof pts)[0]>()
      .x((d) => x(d.x))
      .y((d) => y(d.yClamp));

    g.append("path")
      .datum(pts)
      .attr("fill", "none")
      .attr("stroke", "#475569")
      .attr("stroke-dasharray", "6 4")
      .attr("d", idLine);

    g.append("path")
      .datum(pts)
      .attr("fill", "none")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 2.5)
      .attr("d", clampLine);

    for (const v of [0.25, 1, 4]) {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", iw)
        .attr("y1", y(v))
        .attr("y2", y(v))
        .attr("stroke", "#334155")
        .attr("stroke-dasharray", "2 6");
    }

    g.append("text")
      .attr("x", iw - 4)
      .attr("y", y(1) - 8)
      .attr("text-anchor", "end")
      .attr("fill", "#64748b")
      .attr("font-size", "10px")
      .text("identity (no clamp)");

    g.append("text")
      .attr("x", iw - 4)
      .attr("y", y(2.5))
      .attr("text-anchor", "end")
      .attr("fill", "#7dd3fc")
      .attr("font-size", "10px")
      .text("ClampTime");

    return () => {
      svg.selectAll("*").remove();
    };
  }, []);

  return (
    <figure>
      <svg ref={ref} width="100%" role="img" aria-label="Retarget time clamp" />
      <figcaption className="viz-caption">
        <code>T_expected</code> = {T_EXPECTED_SEC.toLocaleString()} s (14 days). Gray dashed line = raw
        timespan / <code>T_expected</code>; cyan = clamped ratio per §7.1{" "}
        <code>ClampTime</code> in <code>{specViz.repoRelative.protocol}</code>. Horizontal guides at 0.25,
        1, and 4.
      </figcaption>
    </figure>
  );
}
