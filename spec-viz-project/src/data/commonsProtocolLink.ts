import { slug } from "github-slugger";

/**
 * Default: sibling of `spec-viz/` on Bitcoin Commons (`protocol.html` + GFM heading ids).
 * Override for local dev: `VITE_ORANGE_PAPER_PROTOCOL_URL=https://thebitcoincommons.org/protocol.html`
 */
const DEFAULT_PROTOCOL_VIEWER = "../protocol.html";
const DEFAULT_ARCHITECTURE_VIEWER = "../architecture.html";

export function getProtocolViewerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ORANGE_PAPER_PROTOCOL_URL?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_PROTOCOL_VIEWER;
  return base.replace(/\/$/, "");
}

/** `id` attribute GFM / marked-gfm-heading-id assigns to `### Full Heading Text`. */
export function protocolHeadingId(headingText: string): string {
  return slug(headingText);
}

/** Opens the in-site PROTOCOL viewer scrolled to the section heading. */
export function protocolHeadingHref(headingText: string): string {
  return `${getProtocolViewerBaseUrl()}#${protocolHeadingId(headingText)}`;
}

export function getArchitectureViewerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ORANGE_PAPER_ARCHITECTURE_URL?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_ARCHITECTURE_VIEWER;
  return base.replace(/\/$/, "");
}

/** Opens the in-site ARCHITECTURE viewer scrolled to the section heading. */
export function architectureHeadingHref(headingText: string): string {
  return `${getArchitectureViewerBaseUrl()}#${protocolHeadingId(headingText)}`;
}
