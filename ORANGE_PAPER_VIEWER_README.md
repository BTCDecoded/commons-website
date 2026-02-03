# Orange Paper Viewer

## Overview

The Orange Paper Viewer (`orange-paper.html`) is a web-based viewer for The Orange Paper that properly renders all formats used in the specification, including:

- **Mermaid Diagrams**: 9 flowcharts and sequence diagrams
- **LaTeX Math**: 1031+ mathematical formulas (both inline `$...$` and block `$$...$$`)
- **Markdown Formatting**: Full markdown support with proper styling

## Features

### ✅ Proper Rendering

Unlike GitHub's markdown renderer, this viewer:
- Renders all Mermaid diagrams correctly
- Displays LaTeX math formulas properly
- Maintains consistent formatting
- Supports dark mode
- Is fully responsive

### Technologies Used

- **MathJax 3**: For LaTeX/mathematical formula rendering
- **Mermaid.js 10**: For diagram rendering
- **Marked.js**: For markdown parsing
- **Vanilla JavaScript**: No framework dependencies

### How It Works

1. Fetches `THE_ORANGE_PAPER.md` from the blvm-spec repository (GitHub raw URL)
2. Parses markdown using Marked.js
3. Converts Mermaid code blocks to `<div class="mermaid">` elements
4. Renders Mermaid diagrams using Mermaid.js
5. Renders LaTeX math using MathJax
6. Applies custom styling matching the Commons website

## Usage

Simply open `orange-paper.html` in a web browser. The page will:
1. Show a loading message
2. Fetch the Orange Paper from GitHub
3. Render all content with proper formatting
4. Display any errors if loading fails

## Integration

The viewer is linked from the homepage in the repository selection section. Users can click "View Orange Paper" to access the viewer.

## Future Enhancements

Potential improvements:
- Table of contents sidebar navigation
- Search functionality
- Section anchors and deep linking
- Print/PDF export
- Offline support (service worker)
- Version selection (if multiple versions exist)

## Browser Compatibility

- Modern browsers with ES6+ support
- Requires JavaScript enabled
- Works with Content Security Policy (CSP) configured

## Notes

- The viewer fetches content from GitHub, so it requires internet connectivity
- Mermaid diagrams use dark theme to match the site's dark mode
- MathJax is configured to skip code blocks to avoid conflicts
