import React, { useLayoutEffect, useRef } from "react";
import { SUNBURST_SVG_SIZE_PX } from "./sunburstLayoutConstants";
import { SectionSunburst } from "./viz/SectionSunburst";

const EMBED_MSG = "btcc-sunburst-embed-height";

/** Root padding from `.page.embed-sunburst-page` + rounding slop (px). */
const EMBED_CHROME_PX = 32;

function isEmbed(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("embed") === "1";
  } catch {
    return false;
  }
}

/** Notifies parent window of content height (same-origin embed on index2). */
function EmbedHeightBridge({ rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> }) {
  const embed = isEmbed();
  useLayoutEffect(() => {
    if (!embed || !rootRef.current) return;
    const el = rootRef.current;
    const post = () => {
      try {
        const fig = el.querySelector("figure.sunburst-wrap");
        const figH = fig?.getBoundingClientRect().height ?? 0;
        const rootH = el.getBoundingClientRect().height;
        const docH = document.documentElement?.scrollHeight ?? 0;
        const bodyH = document.body?.scrollHeight ?? 0;
        const floor = SUNBURST_SVG_SIZE_PX + EMBED_CHROME_PX;
        let tallest = Math.max(floor, figH, rootH, docH, bodyH);
        const panel = document.querySelector(".sunburst-detail-panel");
        if (panel) {
          tallest = Math.max(tallest, Math.ceil(panel.getBoundingClientRect().bottom + 16));
          tallest = Math.max(tallest, window.innerHeight);
        }
        const h = Math.ceil(tallest + 6);
        if (h > 0 && window.parent && window.parent !== window) {
          // Parent should verify e.source; "*" keeps file:// and odd origins working.
          window.parent.postMessage({ type: EMBED_MSG, height: h }, "*");
        }
      } catch {
        /* ignore */
      }
    };
    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(el);
    const figEl = el.querySelector("figure.sunburst-wrap");
    if (figEl) ro.observe(figEl);
    ro.observe(document.body);
    window.addEventListener("resize", post);
    window.addEventListener("load", post);
    const t = window.setTimeout(post, 400);
    const t2 = window.setTimeout(post, 1200);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", post);
      window.removeEventListener("load", post);
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [embed, rootRef]);
  return null;
}

/** Minimal embed: outline sunburst only (for quiet landings e.g. commons-website index2). */
export default function AppSunburst() {
  const embed = isEmbed();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!embed) return;
    const html = document.documentElement;
    const { body } = document;
    html.classList.add("sunburst-embed-root");
    body.classList.add("sunburst-embed-root");
    return () => {
      html.classList.remove("sunburst-embed-root");
      body.classList.remove("sunburst-embed-root");
    };
  }, [embed]);

  if (embed) {
    return (
      <div ref={rootRef} className="page embed-sunburst-page">
        <EmbedHeightBridge rootRef={rootRef} />
        <section className="panel embed-sunburst-panel">
          <SectionSunburst hideCaption />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="spec-viz-crossnav" aria-label="Spec visualization pages">
        <a href="./index.html">← All charts &amp; maps</a>
        <span className="spec-viz-crossnav-muted spec-viz-crossnav-onpage">Sunburst only</span>
      </nav>

      <header className="hero">
        <h1>Spec outline sunburst</h1>
        <p>
          Each slice is a heading; size reflects prose under that heading in{" "}
          <code>PROTOCOL.md</code> and <code>ARCHITECTURE.md</code>. Default view hides framing, system model,
          security-property proof chapters, short arch performance/security gloss, and wrap-up/references (
          <code>?outline=full</code> shows everything).
        </p>
      </header>

      <section className="panel">
        <SectionSunburst />
      </section>

      <footer className="foot">
        <p>
          <a href="./index.html">Full visualization set →</a>
          {" · "}
          <a href="./reference.html">Constants &amp; formula index →</a>
        </p>
      </footer>
    </div>
  );
}
