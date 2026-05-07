import * as d3 from "d3";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CompEdge, CompNode, CompositionGraphData } from "../data/compositionGraph";
import { compositionGraphs } from "../data/compositionGraph";

function reachableFromRoot(rootId: string, edges: CompEdge[]): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of out.get(u) ?? []) stack.push(v);
  }
  return seen;
}

function computeLayers(
  rootId: string,
  nodes: CompNode[],
  edges: CompEdge[],
): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const preds = new Map<string, Set<string>>();
  for (const n of nodes) preds.set(n.id, new Set());
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    preds.get(e.to)!.add(e.from);
  }

  const layer = new Map<string, number>();
  layer.set(rootId, 0);

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 256) {
    changed = false;
    for (const n of nodes) {
      if (n.id === rootId) continue;
      const ps = preds.get(n.id)!;
      if (ps.size === 0) {
        const next = layer.get(n.id) ?? 0;
        if (!layer.has(n.id) || next !== 0) {
          layer.set(n.id, 0);
          changed = true;
        }
        continue;
      }
      let best = -1;
      let ready = true;
      for (const p of ps) {
        if (!layer.has(p)) {
          ready = false;
          break;
        }
        best = Math.max(best, layer.get(p)! + 1);
      }
      if (ready && best >= 0 && layer.get(n.id) !== best) {
        layer.set(n.id, best);
        changed = true;
      }
    }
  }
  return layer;
}

interface LayoutPos {
  x: number;
  y: number;
  node: CompNode;
}

export interface LayoutResult {
  positions: Map<string, LayoutPos>;
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
}

function truncateLabel(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function buildLayers(data: CompositionGraphData, nodes: CompNode[], edges: CompEdge[]) {
  const layerMap = computeLayers(data.rootId, nodes, edges);
  const maxLayer = d3.max([...layerMap.values()], (d) => d) ?? 0;
  const layers: CompNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) {
    const L = layerMap.get(n.id) ?? 0;
    layers[L]!.push(n);
  }
  for (const row of layers) {
    row.sort((a, b) => a.label.localeCompare(b.label));
  }
  return { layers, maxLayer };
}

function layoutLayered(data: CompositionGraphData): LayoutResult {
  const reach = reachableFromRoot(data.rootId, data.edges);
  const nodes = data.nodes.filter((n) => reach.has(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = data.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  const { layers, maxLayer } = buildLayers(data, nodes, edges);

  const nodeW = 200;
  const nodeH = 44;
  const rowGap = 72;
  const colW = 260;
  const padT = 48;
  const padL = 40;
  const maxRows = d3.max(layers, (r) => r.length) ?? 1;
  const height = padT * 2 + Math.max(maxRows * rowGap, 320);

  const positions = new Map<string, LayoutPos>();
  layers.forEach((row, L) => {
    const colH = row.length * rowGap;
    const y0 = padT + (height - padT * 2 - colH) / 2;
    row.forEach((node, i) => {
      positions.set(node.id, {
        x: padL + L * colW,
        y: y0 + i * rowGap,
        node,
      });
    });
  });

  const width = padL * 2 + maxLayer * colW + 200;
  return { positions, width, height, nodeW, nodeH };
}

function graphKindCounts(data: CompositionGraphData) {
  const reach = reachableFromRoot(data.rootId, data.edges);
  const nodes = data.nodes.filter((n) => reach.has(n.id));
  let primitives = 0;
  let composites = 0;
  for (const n of nodes) {
    if (n.kind === "primitive") primitives++;
    else composites++;
  }
  return { primitives, composites, total: nodes.length };
}

function CompositionGraphSvg({ data }: { data: CompositionGraphData }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradId = useId().replace(/:/g, "");
  const { positions, width, height, nodeW, nodeH } = useMemo(() => layoutLayered(data), [data]);

  const edges = useMemo(() => {
    const reach = reachableFromRoot(data.rootId, data.edges);
    const ids = new Set(data.nodes.filter((n) => reach.has(n.id)).map((n) => n.id));
    return data.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [data]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node()) return;
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const gRoot = svg.append("g").attr("class", "composition-root");

    const arrowId = `arrow-${gradId}`;

    svg
      .append("defs")
      .append("marker")
      .attr("id", arrowId)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    for (const e of edges) {
      const s = positions.get(e.from);
      const t = positions.get(e.to);
      if (!s || !t) continue;
      const path = d3.path();
      const sx = s.x + nodeW;
      const sy = s.y + nodeH / 2;
      const tx = t.x;
      const ty = t.y + nodeH / 2;
      const mid = (sx + tx) / 2;
      path.moveTo(sx, sy);
      path.bezierCurveTo(mid, sy, mid, ty, tx, ty);
      gRoot
        .append("path")
        .attr("d", path.toString())
        .attr("fill", "none")
        .attr("stroke", "#64748b")
        .attr("stroke-width", 1.5)
        .attr("marker-end", `url(#${arrowId})`)
        .append("title")
        .text(e.note ?? `${e.from} → ${e.to}`);
    }

    const nodeGs = gRoot
      .selectAll("g.node")
      .data([...positions.values()])
      .join("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    nodeGs
      .append("rect")
      .attr("width", nodeW)
      .attr("height", nodeH)
      .attr("rx", 8)
      .attr("fill", (d) => (d.node.kind === "primitive" ? "#14532d" : "#431407"))
      .attr("stroke", (d) => (d.node.kind === "primitive" ? "#4ade80" : "#fb923c"))
      .attr("stroke-width", 2);

    nodeGs
      .append("text")
      .attr("x", 10)
      .attr("y", 18)
      .attr("font-size", "13px")
      .attr("font-weight", "600")
      .attr("fill", "#f1f5f9")
      .text((d) => truncateLabel(d.node.label, 80));

    nodeGs
      .append("text")
      .attr("x", 10)
      .attr("y", 36)
      .attr("font-size", "11px")
      .attr("fill", "#94a3b8")
      .text((d) =>
        truncateLabel(
          [d.node.specRef, d.node.kind === "primitive" ? "primitive" : "composite"]
            .filter(Boolean)
            .join(" · "),
          80,
        ),
      );

    nodeGs.append("title").text(
      (d) => `${d.node.label}\n${d.node.specRef ?? ""}\n${d.node.implHint ?? ""}`.trim(),
    );

    return () => {
      svg.selectAll("*").remove();
    };
  }, [data, edges, gradId, height, nodeH, nodeW, positions, width]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      role="img"
      aria-label={data.title}
      style={{ maxWidth: "100%" }}
    />
  );
}

export function CompositionGraphExplorer() {
  const [idx, setIdx] = useState(0);
  const data = compositionGraphs[idx] ?? compositionGraphs[0]!;
  const counts = useMemo(() => graphKindCounts(data), [data]);

  return (
    <div className="composition-explorer">
      <div className="composition-toolbar composition-toolbar-wrap">
        <div className="composition-toolbar-row">
          <label htmlFor="graph-select">Graph</label>
          <select
            id="graph-select"
            value={data.id}
            onChange={(e) => {
              const i = compositionGraphs.findIndex((g) => g.id === e.target.value);
              if (i >= 0) setIdx(i);
            }}
          >
            {compositionGraphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          <span className="composition-stats-text composition-stats-inline" title="Nodes in this subgraph">
            <strong>{counts.total}</strong> nodes · {counts.composites} composite · {counts.primitives}{" "}
            primitive
          </span>
        </div>
      </div>
      <p className="composition-desc">{data.description}</p>
      <div className="composition-legend">
        <span>
          <i className="swatch composite" /> composite
        </span>
        <span>
          <i className="swatch primitive" /> primitive
        </span>
        <span className="edge-legend">Arrows: composed of / invokes</span>
      </div>
      <CompositionGraphSvg data={data} />
      <p className="viz-caption">
        <strong>Layered layout</strong> uses longest dependency depth as columns. Nodes and edges are
        hand-authored: they summarize the ConnectBlock / validation stack in <code>blvm-consensus</code>, not
        the automated outline / <code>spec_locked</code> extract.
      </p>
    </div>
  );
}
