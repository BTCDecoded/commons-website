import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import { buildSectionIdToTitle, sectionIdToVizLabel } from "../data/sectionHeadingLookup";
import { pickModulesForViz } from "../data/moduleSelection";
import { specViz } from "../data/loadSpecViz";

const MAX_COLS = 20;

type ModuleRow = (typeof specViz.specLocked.byModule)[number];

/**
 * Columns must make sense for *these* rows: each module gets a chance to place its strongest §
 * that is not yet represented, so niche modules are not compared only to "lib's" columns.
 * Rows with no hits in the final column set are dropped.
 */
function buildHeatmapAxes(
  modsIn: ModuleRow[],
  bySection: { section: string; count: number }[],
): { mods: ModuleRow[]; secs: string[] } {
  const rank = new Map(bySection.map((s, i) => [s.section, i]));
  const colScore = new Map<string, number>();
  for (const m of modsIn) {
    for (const [sec, c] of Object.entries(m.sections)) {
      if (c > 0) colScore.set(sec, (colScore.get(sec) ?? 0) + c);
    }
  }

  const secs: string[] = [];
  const pushSec = (s: string) => {
    if (!secs.includes(s)) secs.push(s);
  };

  /** Coverage: every row should light up somewhere (add that row's top § if not already covered). */
  for (const m of modsIn) {
    if (secs.some((s) => (m.sections[s] ?? 0) > 0)) continue;
    const best = Object.entries(m.sections)
      .filter(([, c]) => c > 0)
      .sort(
        (a, b) =>
          b[1] - a[1] || (rank.get(a[0]) ?? 9999) - (rank.get(b[0]) ?? 9999),
      )[0]?.[0];
    if (best) pushSec(best);
  }

  const rest = [...colScore.keys()]
    .filter((s) => !secs.includes(s))
    .sort(
      (a, b) =>
        (colScore.get(b) ?? 0) - (colScore.get(a) ?? 0) ||
        (rank.get(a) ?? 9999) - (rank.get(b) ?? 9999),
    );
  for (const s of rest) {
    if (secs.length >= MAX_COLS) break;
    pushSec(s);
  }

  const mods = modsIn.filter((m) => secs.some((s) => (m.sections[s] ?? 0) > 0));

  return { mods, secs };
}

/**
 * Heatmap: consensus crate module (top-level under src) × Orange Paper section — `spec_locked` hits.
 */
export function ModuleSectionHeatmap() {
  const ref = useRef<SVGSVGElement | null>(null);
  const idToTitle = useMemo(() => buildSectionIdToTitle(specViz.orangePaper), []);

  const layout = useMemo(() => {
    const modsIn = pickModulesForViz(specViz.specLocked.byModule, 14, []);
    const { mods, secs } = buildHeatmapAxes(modsIn, specViz.specLocked.bySection);
    const matrix = mods.map((m) => secs.map((sec) => m.sections[sec] ?? 0));
    const flat = matrix.flat();
    const maxV = d3.max(flat) ?? 1;
    const cellW = 52;
    const cellH = 28;
    const labelW = 88;
    const labelH = 28;
    const pad = 12;
    const w = labelW + pad + secs.length * cellW + pad;
    const h = pad + mods.length * cellH + labelH + pad;
    return { mods, secs, matrix, maxV, w, h, cellW, cellH, labelW, labelH, pad };
  }, []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    const { mods, secs, matrix, maxV, w, h, cellW, cellH, labelW, labelH, pad } = layout;
    if (mods.length === 0 || secs.length === 0) {
      svg.attr("viewBox", "0 0 400 80");
      svg
        .append("text")
        .attr("x", 16)
        .attr("y", 44)
        .attr("fill", "#94a3b8")
        .text("No spec_locked module × section data in this bundle.");
      return () => svg.selectAll("*").remove();
    }

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const color = d3.scaleSequential(d3.interpolateRgb("#334155", "#ea580c")).domain([0, maxV]);

    const g = svg.append("g").attr("transform", `translate(${pad},${pad})`);

    g.selectAll("text.rowlab")
      .data(mods)
      .join("text")
      .attr("class", "rowlab")
      .attr("x", labelW - 6)
      .attr("y", (_d, i) => i * cellH + cellH / 2 + 4)
      .attr("text-anchor", "end")
      .attr("font-size", "10px")
      .attr("fill", "#cbd5e1")
      .text((d) => (d.module.length > 12 ? `${d.module.slice(0, 10)}…` : d.module));

    g.selectAll("text.collab")
      .data(secs)
      .join("text")
      .attr("class", "collab")
      .attr("x", (_d, i) => labelW + i * cellW + cellW / 2)
      .attr("y", mods.length * cellH + labelH - 6)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .attr("fill", "#94a3b8")
      .text((s) => sectionIdToVizLabel(s, idToTitle, 10));

    g.selectAll("rect.cell")
      .data(
        mods.flatMap((m, i) =>
          secs.map((sec, j) => ({
            i,
            j,
            v: matrix[i]![j]!,
            sec,
            mod: m.module,
          })),
        ),
      )
      .join("rect")
      .attr("class", "cell")
      .attr("x", (d) => labelW + d.j * cellW + 1)
      .attr("y", (d) => d.i * cellH + 1)
      .attr("width", cellW - 2)
      .attr("height", cellH - 2)
      .attr("rx", 2)
      .attr("fill", (d) => (d.v > 0 ? color(d.v) : "#1e293b"))
      .attr("stroke", "#475569")
      .append("title")
      .text(
        (d) =>
          `${d.mod} × §${d.sec} (${sectionIdToVizLabel(d.sec, idToTitle, 80)}): ${d.v}`,
      );

    return () => {
      svg.selectAll("*").remove();
    };
  }, [idToTitle, layout]);

  const svgHeight = Math.max(280, layout.h);

  return (
    <figure>
      <svg
        ref={ref}
        width="100%"
        height={svgHeight}
        role="img"
        aria-label="Module section heatmap"
      />
      <figcaption className="viz-caption">
        Rows = top modules by total <code>spec_locked</code> count, then <strong>only modules that
        have at least one hit</strong> in the chosen § columns. Columns = first ensure each of those
        rows has its strongest § represented, then add high-traffic § (sums across these rows) up to{" "}
        {MAX_COLS}. Modules that would be all empty (e.g. only cite § outside the cap) are omitted.
      </figcaption>
    </figure>
  );
}
