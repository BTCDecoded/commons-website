import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import { buildSectionIdToTitle, friendlyHeadingTitle } from "../data/sectionHeadingLookup";
import { pickModulesForViz } from "../data/moduleSelection";
import { specViz } from "../data/loadSpecViz";

type NetNode = {
  id: string;
  kind: "module" | "section";
  /** Primary line inside the circle (module name or § id). */
  line1: string;
  /** Secondary line (counts / short heading), optional when circle is small. */
  line2: string | null;
  /** Full hover explanation. */
  tooltip: string;
  /** Set only for `section` — Orange Paper id, e.g. `5.1.1`. */
  sectionId?: string;
} & d3.SimulationNodeDatum;

type NetLink = d3.SimulationLinkDatum<NetNode> & { weight: number };

function linkNode(end: NetLink["source"] | NetLink["target"]): NetNode {
  return end as unknown as NetNode;
}

const MAX_SECTION_NODES = 16;

/**
 * Sections that appear in the chosen modules, ordered by **edge weight to those modules** (then global
 * spec_locked rank). Avoids arbitrary Set iteration order cutting the wrong §.
 */
function pickSectionsForGraph(
  mods: (typeof specViz.specLocked.byModule)[number][],
): string[] {
  const globalIdx = new Map(specViz.specLocked.bySection.map((x, i) => [x.section, i]));
  const secSet = new Set<string>();
  for (const m of mods) {
    for (const [s, c] of Object.entries(m.sections)) {
      if (c > 0) secSet.add(s);
    }
  }
  const localWeight = new Map<string, number>();
  for (const s of secSet) {
    let sum = 0;
    for (const m of mods) sum += m.sections[s] ?? 0;
    localWeight.set(s, sum);
  }
  return [...secSet]
    .sort((a, b) => {
      const diff = (localWeight.get(b) ?? 0) - (localWeight.get(a) ?? 0);
      if (diff !== 0) return diff;
      return (globalIdx.get(a) ?? 9999) - (globalIdx.get(b) ?? 9999);
    })
    .slice(0, MAX_SECTION_NODES);
}

/**
 * Bipartite force layout: `blvm-consensus` **top-level modules** (src subdirs / roots) ↔ Orange Paper
 * **section ids** cited via `#[spec_locked("…")]`. Edge weight = count of those attributes on that
 * module→§ pair in extracted data.
 */
export function SpecLockNetwork() {
  const ref = useRef<SVGSVGElement | null>(null);

  const graph = useMemo(() => {
    const idToTitle = buildSectionIdToTitle(specViz.orangePaper);
    const mods = pickModulesForViz(specViz.specLocked.byModule, 14);
    const secs = pickSectionsForGraph(mods);

    const nodes: NetNode[] = [
      ...mods.map((m) => {
        const total = m.total;
        const line1 = m.module;
        const line2 = total === 1 ? "1 lock" : `${total} locks`;
        const tooltip = [
          `Rust module “${m.module}” (under blvm-consensus/src).`,
          `This row aggregates every #[spec_locked("…")] in .rs files attributed to this directory (${total} total in extracted data).`,
          `Orange nodes = code-side grouping; lines go to Blue § nodes = Orange Paper section ids actually cited from this module among the modules and § shown in this graph.`,
        ].join(" ");
        return {
          id: `m:${m.module}`,
          kind: "module" as const,
          line1,
          line2,
          tooltip,
        };
      }),
      ...secs.map((s) => {
        const raw = idToTitle.get(s);
        const titleFull = raw ? friendlyHeadingTitle(raw) : "";
        const line1 = `§${s}`;
        const line2 = titleFull ? (titleFull.length > 18 ? `${titleFull.slice(0, 16)}…` : titleFull) : null;
        const tooltip = [
          `Orange Paper section id ${s}${raw ? ` — ${friendlyHeadingTitle(raw)}` : ""}.`,
          `Blue nodes are spec § identifiers; size reflects total spec_locked edge weight to/from this node in the subgraph.`,
          `Citations come from #[spec_locked("${s}")] (and subsection ids where used) in blvm-consensus sources included in the extract.`,
        ].join(" ");
        return {
          id: `s:${s}`,
          kind: "section" as const,
          line1,
          line2,
          tooltip,
          sectionId: s,
        };
      }),
    ];

    const edgeList: { source: string; target: string; weight: number }[] = [];
    for (const m of mods) {
      for (const s of secs) {
        const wt = m.sections[s];
        if (wt) edgeList.push({ source: `m:${m.module}`, target: `s:${s}`, weight: wt });
      }
    }

    return { nodes, links: edgeList };
  }, []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();

    if (graph.nodes.length === 0) return;

    const w = 1000;
    const h = 600;
    const pad = 10;

    const strength = new Map<string, number>();
    for (const n of graph.nodes) strength.set(n.id, 0);
    for (const l of graph.links) {
      strength.set(l.source as string, (strength.get(l.source as string) ?? 0) + l.weight);
      strength.set(l.target as string, (strength.get(l.target as string) ?? 0) + l.weight);
    }

    /** Exaggerated radii so differences read clearly. */
    function nodeRadius(d: NetNode): number {
      const s = strength.get(d.id) ?? 0;
      const base = d.kind === "module" ? 26 : 22;
      return base + Math.min(52, 7.2 * Math.sqrt(s));
    }

    const nodes = graph.nodes.map((d) => ({ ...d }));
    const simLinks: NetLink[] = graph.links.map((d) => ({
      source: d.source,
      target: d.target,
      weight: d.weight,
    }));

    const simulation = d3
      .forceSimulation<NetNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<NetNode, NetLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            const wt = d.weight ?? 1;
            return 62 + 130 / Math.sqrt(wt + 0.5);
          })
          .strength(0.52),
      )
      .force("charge", d3.forceManyBody().strength(-520))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("x", d3.forceX(w / 2).strength(0.055))
      .force("y", d3.forceY(h / 2).strength(0.055))
      .force("collide", d3.forceCollide<NetNode>().radius((d) => nodeRadius(d) + 8));

    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const g = svg.append("g");

    const link = g
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "#64748b")
      .attr("stroke-opacity", 0.88)
      .attr("stroke-width", (d) => 1.1 + 1.25 * Math.sqrt(d.weight));

    link.each(function (d) {
      const sid =
        typeof d.source === "string" ? d.source : (d.source as NetNode).id;
      const tid =
        typeof d.target === "string" ? d.target : (d.target as NetNode).id;
      const mod = sid.startsWith("m:") ? sid.slice(2) : sid;
      const sec = tid.startsWith("s:") ? tid.slice(2) : tid;
      const tip = `Code link: module “${mod}” cites Orange Paper §${sec} in ${d.weight} #[spec_locked("…")] attribute(s) counted for this pair in the extract (same module may cite the same § from multiple files).`;
      d3.select(this).append("title").text(tip);
    });

    const node = g
      .selectAll("g.n")
      .data(nodes)
      .join("g")
      .attr("class", "n");

    node
      .append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => (d.kind === "module" ? "#431407" : "#1e3a5f"))
      .attr("stroke", (d) => (d.kind === "module" ? "#fb923c" : "#60a5fa"))
      .attr("stroke-width", 2.5)
      .each(function (d) {
        d3.select(this).append("title").text(d.tooltip);
      });

    node
      .each(function (d) {
        const r = nodeRadius(d);
        const gEl = d3.select(this);
        const fs1 = Math.max(8.5, Math.min(13, r / 2.4));
        const fs2 = Math.max(7, fs1 - 2);
        gEl
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dy", d.line2 && r >= 28 ? "-0.45em" : "0.35em")
          .attr("font-size", `${fs1}px`)
          .attr("font-weight", "600")
          .attr("fill", "#f8fafc")
          .style("pointer-events", "none")
          .text(d.line1);
        if (d.line2 && r >= 24) {
          gEl
            .append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "1.05em")
            .attr("font-size", `${fs2}px`)
            .attr("font-weight", "400")
            .attr("fill", "#cbd5e1")
            .style("pointer-events", "none")
            .text(d.line2);
        }
      });

    simulation.on("tick", () => {
      for (const d of nodes) {
        const r = nodeRadius(d) + pad;
        d.x = Math.max(r, Math.min(w - r, d.x!));
        d.y = Math.max(r, Math.min(h - r, d.y!));
      }
      link
        .attr("x1", (d) => linkNode(d.source).x!)
        .attr("y1", (d) => linkNode(d.source).y!)
        .attr("x2", (d) => linkNode(d.target).x!)
        .attr("y2", (d) => linkNode(d.target).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    simulation.alpha(1).restart();
    for (let i = 0; i < 480; i++) simulation.tick();
    simulation.stop();
    for (const d of nodes) {
      const r = nodeRadius(d) + pad;
      d.x = Math.max(r, Math.min(w - r, d.x!));
      d.y = Math.max(r, Math.min(h - r, d.y!));
    }
    link
      .attr("x1", (d) => linkNode(d.source).x!)
      .attr("y1", (d) => linkNode(d.source).y!)
      .attr("x2", (d) => linkNode(d.target).x!)
      .attr("y2", (d) => linkNode(d.target).y!);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);

    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, [graph]);

  return (
    <figure>
      <svg ref={ref} width="100%" height={600} role="img" aria-label="Spec lock network" />
      <figcaption className="viz-caption">
        <strong>Orange</strong> = <code>blvm-consensus/src</code> top-level module (directory / crate
        root file bucket in the extract). <strong>Blue</strong> = Orange Paper section id (PROTOCOL +
        ARCHITECTURE outline). An edge means that module’s Rust sources include{" "}
        <code>#[spec_locked(&quot;§…&quot;)]</code> pointing at that id; thickness and node size scale
        with extracted counts. <strong>Pinned</strong> modules (<code>economic</code>,{" "}
        <code>taproot</code>) stay in the list when present so they are not hidden behind{" "}
        <code>lib.rs</code> volume. § shown are the strongest links to <em>these</em> modules, not an
        arbitrary slice. Hover nodes and edges for detail.
      </figcaption>
    </figure>
  );
}
