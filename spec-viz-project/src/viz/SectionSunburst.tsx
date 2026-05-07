import * as d3 from "d3";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/** Post a structured message to the parent page (no-op when not embedded / cross-origin). */
function postParent(msg: Record<string, unknown>): void {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  } catch {
    /* cross-origin or unavailable */
  }
}

/** True when this component is running inside an iframe. */
function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}
import {
  architectureHeadingHref,
  getArchitectureViewerBaseUrl,
  getProtocolViewerBaseUrl,
  protocolHeadingHref,
} from "../data/commonsProtocolLink";
import { truncateFriendlyHeading } from "../data/sectionHeadingLookup";
import { specViz, type OutlineNode } from "../data/loadSpecViz";
import { getOrangePaperForOutlineViz } from "../data/specOutlineFilter";
import { SunburstPreviewBody } from "./SunburstPreviewBody";
import { SUNBURST_RADIUS_PX, SUNBURST_SVG_SIZE_PX } from "../sunburstLayoutConstants";

/** KaTeX-rendered HTML for the parent-page modal (same pipeline as in-chart popup). */
function renderPreviewToHtml(text: string): string {
  const t = text?.trim() ?? "";
  if (!t) return "";
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(<SunburstPreviewBody text={text} />);
    });
    return host.innerHTML;
  } finally {
    root.unmount();
  }
}

function sumLeaves(n: OutlineNode): number {
  if (n.children?.length) {
    return d3.sum(n.children, sumLeaves);
  }
  return n.value ?? 0;
}

type PartNode = d3.HierarchyRectangularNode<OutlineNode>;

type SunburstSectionMeta = {
  title: string;
  preview: string;
  href: string;
  viewerLabel: string;
  lineCount: number;
};

type SunburstDetailState =
  | {
      kind: "section";
      meta: SunburstSectionMeta;
      path: string[];
      clientX: number;
      clientY: number;
    }
  | {
      kind: "doc-root";
      doc: "protocol" | "architecture";
      path: string[];
      clientX: number;
      clientY: number;
    };

function sectionViewerMeta(d: PartNode): SunburstSectionMeta | null {
  const name = d.data.name;
  if (name === "Orange Paper" || name === "PROTOCOL.md" || name === "ARCHITECTURE.md") {
    return null;
  }
  let p: PartNode | null = d.parent;
  let doc: "protocol" | "architecture" | null = null;
  while (p) {
    if (p.data.name === "PROTOCOL.md") {
      doc = "protocol";
      break;
    }
    if (p.data.name === "ARCHITECTURE.md") {
      doc = "architecture";
      break;
    }
    p = p.parent;
  }
  if (!doc) return null;
  const href = doc === "protocol" ? protocolHeadingHref(name) : architectureHeadingHref(name);
  const preview =
    (d.data.preview && d.data.preview.trim()) ||
    `(No prose in extract under this heading; ${d.value ?? 0} line(s) counted.)`;
  return {
    title: name,
    preview,
    href,
    viewerLabel: doc === "protocol" ? "PROTOCOL" : "ARCHITECTURE",
    lineCount: d.value ?? 0,
  };
}

function placeSunburstPanel(panel: HTMLElement, clientX: number, clientY: number) {
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = panel.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;

  let top = clientY - r.height - pad;
  let left = clientX - r.width / 2;

  if (top < pad) top = clientY + pad;
  if (left < pad) left = pad;
  if (left + r.width > vw - pad) left = Math.max(pad, vw - pad - r.width);
  if (top + r.height > vh - pad) top = Math.max(pad, vh - pad - r.height);
  if (top < pad) top = pad;

  panel.style.position = "fixed";
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.transform = "none";
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.margin = "0";
}

/**
 * PROTOCOL.md + ARCHITECTURE.md outline — arc area ∝ non-heading line count per section (extracted).
 */
type SectionSunburstProps = {
  /** Shorter embed (e.g. index2 iframe): no long caption under the chart. */
  hideCaption?: boolean;
};

export function SectionSunburst({ hideCaption = false }: SectionSunburstProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const initialZoomRef = useRef<d3.ZoomTransform | null>(null);
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [detail, setDetail] = useState<SunburstDetailState | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const closeDetail = () => setDetail(null);

  const resetZoom = useCallback(() => {
    const svgEl = svgRef.current;
    const zb = zoomBehaviorRef.current;
    const it = initialZoomRef.current ?? d3.zoomIdentity;
    if (!svgEl || !zb) return;
    d3.select(svgEl as SVGSVGElement).transition().duration(350).call(zb.transform, it);
  }, []);

  useEffect(() => {
    if (!detail) return;
    closeBtnRef.current?.focus();
  }, [detail]);

  /* When the parent page closes its external modal, clear the highlight ring. */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "btcc-sunburst-popup-close") setFocusPath([]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  useLayoutEffect(() => {
    if (!detail) return;
    const panel = panelRef.current;
    if (!panel) return;

    const run = () => placeSunburstPanel(panel, detail.clientX, detail.clientY);
    run();
    const r0 = panel.getBoundingClientRect();
    if (r0.height < 24) {
      requestAnimationFrame(() => requestAnimationFrame(run));
    }

    const onResize = () => placeSunburstPanel(panel, detail.clientX, detail.clientY);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [detail]);

  const outlineForViz = useMemo(() => getOrangePaperForOutlineViz(specViz.orangePaper), []);

  const layout = useMemo(() => {
    const data = structuredClone(outlineForViz) as OutlineNode;
    const h = d3
      .hierarchy<OutlineNode>(data)
      .sum((d) => (d.children?.length ? 0 : (d.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.partition<OutlineNode>().size([2 * Math.PI, h.height + 1])(h);

    const radius = SUNBURST_RADIUS_PX;
    const radialFactor = 1.16;
    const scale = (radius * radialFactor) / (h.height + 1);

    const arc = d3
      .arc<d3.HierarchyRectangularNode<OutlineNode>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 12, 0.03))
      .innerRadius((d) => d.y0 * scale + 2)
      .outerRadius((d) => Math.max(d.y1 * scale - 1, d.y0 * scale + 15));

    return { root: h, arc, radius, scale, size: SUNBURST_SVG_SIZE_PX };
  }, [outlineForViz]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current as SVGSVGElement);
    svg.selectAll("*").remove();

    const { root, arc, size, radius, scale } = layout;
    const cx = size / 2;
    const cy = size / 2;

    svg.attr("viewBox", `0 0 ${size} ${size}`);

    /* ── Zoom / pan ─────────────────────────────────────────────── */
    /*
     * g has NO hard-coded transform.  The zoom behaviour owns the full
     * translate+scale and seeds it to translate(cx,cy) so the chart is
     * centred at rest.  D3 zoom then computes all pan/zoom relative to
     * that initial state, which means cursor-anchored scaling works
     * correctly without any manual cx/cy arithmetic in the handler.
     */
    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .on("zoom", ({ transform }) => {
        g.attr("transform", transform.toString());
        const initial = initialZoomRef.current;
        const atRest = initial !== null &&
          Math.abs(transform.k - 1) < 0.001 &&
          Math.abs(transform.x - initial.x) < 0.5 &&
          Math.abs(transform.y - initial.y) < 0.5;
        setIsZoomed(!atRest);
      });

    const initialTransform = d3.zoomIdentity.translate(cx, cy);
    initialZoomRef.current = initialTransform;
    svg.call(zoom);
    /* Seed the zoom state so pan/zoom all start from the centred position. */
    svg.call(zoom.transform, initialTransform);
    zoomBehaviorRef.current = zoom;

    const color = d3.scaleOrdinal<string, string>([
      "#ea580c",
      "#2563eb",
      "#64748b",
      "#16a34a",
      "#a855f7",
      "#0ea5e9",
      "#eab308",
      "#f43f5e",
      "#14b8a6",
    ]);

    const nodes = root.descendants().filter((d) => d.depth > 0) as PartNode[];

    const slicePaths = g
      .selectAll<SVGPathElement, PartNode>("path.slice")
      .data(nodes)
      .join("path")
      .attr("class", "slice")
      .attr("fill", (d) => color(String(d.depth) + d.data.name))
      .attr("fill-opacity", (d) => 0.45 + (d.depth / (root.height + 3)) * 0.45)
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1)
      .attr("d", (d) => arc(d as d3.HierarchyRectangularNode<OutlineNode>)!)
      .style("cursor", "pointer")
      .on("click", (ev, d) => {
        ev.preventDefault();
        ev.stopPropagation();
        const node = d as PartNode;
        const path = node.ancestors().map((a) => a.data.name).reverse();
        setFocusPath(path);
        const name = node.data.name;
        const embedded = isEmbedded();

        if (name === "PROTOCOL.md") {
          if (embedded) {
            postParent({ type: "btcc-sunburst-popup-open", kind: "doc-root", doc: "protocol",
              docHref: getProtocolViewerBaseUrl(), path });
          } else {
            setDetail({ kind: "doc-root", doc: "protocol", path, clientX: ev.clientX, clientY: ev.clientY });
          }
          return;
        }
        if (name === "ARCHITECTURE.md") {
          if (embedded) {
            postParent({ type: "btcc-sunburst-popup-open", kind: "doc-root", doc: "architecture",
              docHref: getArchitectureViewerBaseUrl(), path });
          } else {
            setDetail({ kind: "doc-root", doc: "architecture", path, clientX: ev.clientX, clientY: ev.clientY });
          }
          return;
        }
        const meta = sectionViewerMeta(node);
        if (!meta) {
          setDetail(null);
          setFocusPath([]);
          return;
        }
        if (embedded) {
          postParent({
            type: "btcc-sunburst-popup-open",
            kind: "section",
            title: meta.title,
            previewHtml: renderPreviewToHtml(meta.preview),
            href: meta.href,
            viewerLabel: meta.viewerLabel,
            lineCount: meta.lineCount,
            path,
          });
        } else {
          setDetail({ kind: "section", meta, path, clientX: ev.clientX, clientY: ev.clientY });
        }
      });

    slicePaths.append("title").text((d) => {
      const label = truncateFriendlyHeading(d.data.name, 200);
      const lines = d.value ?? 0;
      if (d.data.name === "PROTOCOL.md" || d.data.name === "ARCHITECTURE.md") {
        return `${label}\nlines (excl. headings): ${lines}\nClick for link to the full ${d.data.name === "PROTOCOL.md" ? "protocol" : "architecture"} page`;
      }
      return `${label}\nlines (excl. headings): ${lines}\nClick for preview and link`;
    });

    const minAngle = 0.048;
    const labelNodes = nodes.filter((d) => {
      if (d.depth === 0) return false;
      const span = d.x1 - d.x0;
      const inner = d.y0 * scale + 2;
      const outer = Math.max(d.y1 * scale - 1, d.y0 * scale + 15);
      const midR = (inner + outer) / 2;
      return span > minAngle && span * midR > 28;
    });

    const docRootNames = new Set(["PROTOCOL.md", "ARCHITECTURE.md"]);

    g.selectAll("text.sunburst-lbl")
      .data(labelNodes)
      .join("text")
      .attr("class", "sunburst-lbl")
      .attr("pointer-events", "none")
      .attr("fill", "#e2e8f0")
      .attr("font-size", (d) => (d.depth <= 2 ? "9px" : "7.5px"))
      .attr("font-weight", "500")
      .attr("dominant-baseline", "middle")
      .each(function (d) {
        const [ax, ay] = arc.centroid(d);
        const wide = d.x1 - d.x0 > 0.14;
        const isDocRoot = docRootNames.has(d.data.name);
        const maxLen = isDocRoot ? (wide ? 42 : 32) : wide ? 34 : 22;
        d3.select(this)
          .attr("x", ax)
          .attr("y", ay)
          .attr("text-anchor", "middle")
          .text(truncateFriendlyHeading(d.data.name, maxLen));
      })
      .append("title")
      .text((d) => truncateFriendlyHeading(d.data.name, 200));

    g.append("circle").attr("r", radius * 0.09).attr("fill", "#020617").attr("opacity", 0.95);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#f8fafc")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .attr("letter-spacing", "0.04em")
      .text("BLVM");

    /* ── Hover expand layer (always on top) ──────────────────────── */
    const HOVER_EXPAND = 20;

    const arcHover = d3
      .arc<PartNode>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 12, 0.03))
      .innerRadius((d) => d.y0 * scale + 2)
      .outerRadius((d) => Math.max(d.y1 * scale - 1, d.y0 * scale + 15) + HOVER_EXPAND);

    /* Single group placed last in g so it renders over all slices + labels. */
    const hoverLayer = g.append("g").attr("class", "sb-hover-layer").attr("pointer-events", "none");

    /** True when this node has no permanent label (too small). */
    function isSmallSlice(node: PartNode): boolean {
      const span = node.x1 - node.x0;
      const inner = node.y0 * scale + 2;
      const outer = Math.max(node.y1 * scale - 1, node.y0 * scale + 15);
      const midR = (inner + outer) / 2;
      return !(span > minAngle && span * midR > 28);
    }

    slicePaths
      .on("mouseover", function (_, d) {
        const node = d as PartNode;
        /* Interrupt and wipe any in-progress hover state. */
        hoverLayer.selectAll("*").interrupt().remove();

        /* Large slices have a permanent .sunburst-lbl; hide it while hover label shows. */
        g.selectAll<SVGTextElement, PartNode>("text.sunburst-lbl")
          .interrupt()
          .style("opacity", 1);
        if (!isSmallSlice(node)) {
          g.selectAll<SVGTextElement, PartNode>("text.sunburst-lbl")
            .filter((lbl) => lbl === node)
            .transition()
            .duration(70)
            .style("opacity", 0);
        }

        const fillColor = d3.select<SVGPathElement, PartNode>(this).attr("fill");
        const fillOp = parseFloat(d3.select<SVGPathElement, PartNode>(this).attr("fill-opacity") ?? "0.6");

        /* Expanded arc — starts at original path, transitions to expanded. */
        const originalPath = arc(node)!;
        const expandedPath = arcHover(node)!;

        hoverLayer
          .append("path")
          .attr("d", originalPath)
          .attr("fill", fillColor)
          .attr("fill-opacity", Math.min(fillOp + 0.18, 1))
          .attr("stroke", "#f8fafc")
          .attr("stroke-width", 0.75)
          .transition()
          .duration(110)
          .ease(d3.easeCubicOut)
          .attr("d", expandedPath);

        /* Label: small slices → radial (rotated); large slices → horizontal at centroid. */
        const [hx, hy] = arcHover.centroid(node);
        if (isSmallSlice(node)) {
          const midAngle = (node.x0 + node.x1) / 2;
          /* Flip text so it's always readable (not upside-down on left hemisphere). */
          const flip = midAngle > Math.PI;
          const rotateDeg = (midAngle - Math.PI / 2) * (180 / Math.PI) + (flip ? 180 : 0);

          hoverLayer
            .append("text")
            .attr("pointer-events", "none")
            .attr("class", "sunburst-hover-lbl sunburst-hover-lbl--radial")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7.5px")
            .attr("font-weight", "700")
            .attr("fill", "#f8fafc")
            .attr("stroke", "#0a0f1e")
            .attr("stroke-width", 2.5)
            .attr("stroke-linejoin", "round")
            .attr("paint-order", "stroke")
            .attr("transform", `translate(${hx},${hy}) rotate(${rotateDeg})`)
            .style("opacity", 0)
            .text(truncateFriendlyHeading(node.data.name, 30))
            .transition()
            .duration(110)
            .style("opacity", 1);
        } else {
          const wide = node.x1 - node.x0 > 0.14;
          const isDocRoot = docRootNames.has(node.data.name);
          const maxLen = isDocRoot ? (wide ? 52 : 40) : wide ? 48 : 36;

          hoverLayer
            .append("text")
            .attr("pointer-events", "none")
            .attr("class", "sunburst-hover-lbl sunburst-hover-lbl--horizontal")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", wide ? "8.5px" : "8px")
            .attr("font-weight", "700")
            .attr("fill", "#f8fafc")
            .attr("stroke", "#0a0f1e")
            .attr("stroke-width", 2.5)
            .attr("stroke-linejoin", "round")
            .attr("paint-order", "stroke")
            .attr("x", hx)
            .attr("y", hy)
            .style("opacity", 0)
            .text(truncateFriendlyHeading(node.data.name, maxLen))
            .transition()
            .duration(110)
            .style("opacity", 1);
        }
      })
      .on("mouseout", () => {
        g.selectAll<SVGTextElement, PartNode>("text.sunburst-lbl")
          .interrupt()
          .transition()
          .duration(130)
          .ease(d3.easeCubicOut)
          .style("opacity", 1);
        hoverLayer
          .selectAll("*")
          .transition()
          .duration(130)
          .ease(d3.easeCubicIn)
          .style("opacity", 0)
          .remove();
      });

    const svgEl = svgRef.current as SVGSVGElement;
    return () => {
      d3.select(svgEl).selectAll("*").remove();
      d3.select(svgEl).on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, [layout]);

  const total = sumLeaves(outlineForViz);

  const detailModal =
    detail &&
    createPortal(
      <>
        <div className="sunburst-detail-backdrop" role="presentation" onClick={closeDetail} />
        <div
          ref={panelRef}
          className="sunburst-detail-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sunburst-detail-title"
        >
          {detail.kind === "doc-root" ? (
            <>
              <header className="sunburst-detail-header">
                <h4 id="sunburst-detail-title" className="sunburst-card-title">
                  {detail.doc === "protocol" ? "PROTOCOL.md" : "ARCHITECTURE.md"}
                </h4>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="sunburst-close-btn"
                  onClick={closeDetail}
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              <div className="sunburst-detail-body">
                <p className="sunburst-doc-root-lead">
                  {detail.doc === "protocol"
                    ? "Open the on-site PROTOCOL viewer for the full Orange Paper extract: constants, formulas, and definitions, with math rendering and heading navigation."
                    : "Open the on-site ARCHITECTURE viewer for the full Orange Paper extract: system structure, major components, and how they connect."}
                </p>
                <p className="sunburst-dock-path">
                  <strong>Path:</strong> <code>{detail.path.join(" → ")}</code>
                </p>
                <div className="sunburst-card-actions">
                  <a
                    className="sunburst-open-btn"
                    href={detail.doc === "protocol" ? getProtocolViewerBaseUrl() : getArchitectureViewerBaseUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {detail.doc === "protocol" ? "Open protocol page ↗" : "Open architecture page ↗"}
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <header className="sunburst-detail-header">
                <h4 id="sunburst-detail-title" className="sunburst-card-title">
                  {truncateFriendlyHeading(detail.meta.title, 200)}
                </h4>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="sunburst-close-btn"
                  onClick={closeDetail}
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              <div className="sunburst-detail-body">
                <div className="sunburst-card-meta">
                  ~{detail.meta.lineCount} prose line(s) under heading · {detail.meta.viewerLabel} viewer
                </div>
                <SunburstPreviewBody text={detail.meta.preview} />
                <p className="sunburst-dock-path">
                  <strong>Path:</strong> <code>{detail.path.join(" → ")}</code>
                </p>
                <div className="sunburst-card-actions">
                  <a
                    className="sunburst-open-btn"
                    href={detail.meta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open section ↗
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </>,
      document.body,
    );

  return (
    <figure className="sunburst-wrap">
      <div className="sunburst-controls">
        {isZoomed && (
          <button
            type="button"
            className="sunburst-reset-btn"
            onClick={resetZoom}
            title="Reset zoom and pan"
          >
            ↺ Reset view
          </button>
        )}
        <span className="sunburst-drag-hint">Drag to pan · Scroll to zoom</span>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={layout.size}
        role="img"
        aria-label="Orange Paper sunburst"
        style={{ pointerEvents: "auto", cursor: "grab", touchAction: "none" }}
      />
      {detailModal}
      {!hideCaption ? (
        <figcaption className="viz-caption">
          <strong>TL;DR:</strong> bigger slice = more Orange Paper text under that heading. Hub = BLVM. From{" "}
          <code>{specViz.repoRelative.protocol}</code> + <code>{specViz.repoRelative.architecture}</code> — slice
          size = lines of prose under each heading (headings excluded). Default view drops meta / wrap-up
          sections (see <code>specOutlineFilter.ts</code>); add <code>?outline=full</code> for every heading.{" "}
          <strong>Click</strong> a slice for a KaTeX preview; <strong>×</strong> or the backdrop closes it.
          Total leaf lines ≈ {total}. Generated {specViz.generatedAt.slice(0, 10)}.
          {focusPath.length > 0 ? (
            <>
              {" "}
              Path: <code>{focusPath.join(" → ")}</code>
            </>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
