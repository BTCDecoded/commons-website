# spec-viz (source)

React + Vite + D3 Orange Paper charts. Static output is built into the sibling directory **`../spec-viz/`** (GitHub Pages).

```bash
npm ci
npm run build
rsync -a --delete dist/ ../spec-viz/
```

Data extract (from a checkout that includes `blvm-spec` and `blvm-consensus` at expected paths):

```bash
npm run extract-data
```

Outline sunburst/icicle sections are filtered by default; see `src/data/specOutlineFilter.ts` and `?outline=full`.
