# Bitcoin Commons Website

Static GitHub Pages site for The Bitcoin Commons at [thebitcoincommons.org](https://thebitcoincommons.org).

## Structure

- `index.html` - Homepage (hero, learning paths, Orange Paper embed, FAQ, footer); `index2.html` redirects to it
- `whitepaper.html` - Full HTML version of the Bitcoin Commons whitepaper
- `style.css` - Responsive stylesheet with academic aesthetic and dark mode support
- `assets/` - PDF files, EPUB, logo, and whitepaper images; **`blvm-release.json`** (and fallback) populated at build time for the version badge
- `CNAME` - Custom domain configuration for GitHub Pages

## Build / release badge

The homepage version callout uses data from **`scripts/fetch-blvm-release-meta.mjs`** ( **`blvm` GitHub Releases** ). CI builds with that script before deploy; see **`.github/workflows/pages.yml`**.

## License

MIT License - see LICENSE file.

