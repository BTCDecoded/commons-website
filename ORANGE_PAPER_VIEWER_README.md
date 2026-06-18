# Spec viewers (commons-website)

## Overview

The site hosts markdown viewers for BLVM specification documents from `BTCDecoded/blvm-spec`:

| Page | Source | Role |
|------|--------|------|
| **`spec.html`** | `CONSENSUS_SPEC.md` | **Primary** — numbered consensus rules; `§5.3.1` refs link to `protocol.html` / `architecture.html` section anchors |
| **`orange-paper.html`** | `THE_ORANGE_PAPER.md` | Extended formal spec — navigation hub for PROTOCOL / ARCHITECTURE |
| **`protocol.html`** | `PROTOCOL.md` | Formal consensus math |
| **`architecture.html`** | `ARCHITECTURE.md` | Implementation design |

All viewers share `spec-markdown-viewer.js` (Marked.js, MathJax 3, Mermaid.js 10).

## Features

- Renders Mermaid diagrams and LaTeX math (inline and block)
- Full markdown styling, dark theme, responsive layout
- Internal links from markdown rewrite to hosted viewers (e.g. `CONSENSUS_SPEC.md` → `spec.html`, `PROTOCOL.md#531-header-validation` → `protocol.html#531-header-validation`)
- `section-link-map.json` (from `scripts/build-section-link-map.mjs`) maps Orange Paper section numbers to GFM heading ids
- Fetches live content from GitHub raw URLs (requires network)

## Usage

Open any `*.html` viewer in a browser. The page loads the configured file via `window.BTCC_SPEC_VIEWER.fileName`.

Local testing: see `LOCAL_TESTING.md`.

## Integration

- Homepage (`index.html`) promotes **Consensus Spec** (`spec.html`) as the primary entry; Orange Paper is linked as the extended formal spec.
- Shared nav on all spec pages: Home → Consensus Spec → PROTOCOL → Architecture → Orange Paper → …
- `sitemap.xml` lists `spec.html` at priority 0.95.

## Notes

- Bump `spec-markdown-viewer.js?v=N` when changing the shared script so browsers pick up cache busts.
- Content Security Policy allows GitHub API / raw fetches where configured per page.
