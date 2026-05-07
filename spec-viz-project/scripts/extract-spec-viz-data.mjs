#!/usr/bin/env node
/**
 * Extracts Orange Paper outline + blvm-consensus #[spec_locked] usage for spec-viz.
 * Run from repo: node docs/diagrams/spec-viz/scripts/extract-spec-viz-data.mjs
 * Or: npm run extract-data (from docs/diagrams/spec-viz)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_VIZ = path.join(__dirname, "..");
/** spec-viz → diagrams → docs → btc-commons root */
const REPO = path.join(SPEC_VIZ, "../../..");

const PROTOCOL = path.join(REPO, "blvm-spec/PROTOCOL.md");
const ARCHITECTURE = path.join(REPO, "blvm-spec/ARCHITECTURE.md");
const CONSENSUS_SRC = path.join(REPO, "blvm-consensus/src");

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Plain-text preview of prose under a heading (for sunburst tooltips). */
function makePreviewFromLines(lines, start, endExcl, maxLen) {
  if (start >= endExcl) return "";
  const raw = [];
  for (let k = start; k < endExcl; k++) {
    let L = lines[k].trimEnd();
    if (/^#{1,6}\s/.test(L)) continue;
    L = L.trim();
    if (!L) continue;
    raw.push(L);
  }
  let t = raw.join(" ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/^[-*]\s+/, "");
  if (t.length <= maxLen) return t;
  let cut = t.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  if (sp > maxLen * 0.55) cut = cut.slice(0, sp);
  return `${cut.trimEnd()}…`;
}

function parseMarkdownOutline(md, rootLabel) {
  if (!md) return { name: rootLabel, value: 0, children: [] };
  const lines = md.split(/\r?\n/);
  /** @type {{ line: number; level: number; title: string; lineCount: number }[]} */
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    /** Skip single `#` titles — they span to the next `#` and would swallow the whole file. */
    const m = lines[i].match(/^(#{2,6})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const title = m[2].trim();
    if (title.startsWith("Table of Contents")) continue;
    headings.push({ line: i, level, title, lineCount: 0 });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    let j = h.line + 1;
    while (j < lines.length) {
      const m = lines[j].match(/^(#{1,6})\s/);
      if (m && m[1].length <= h.level) break;
      j++;
    }
    h.lineCount = Math.max(0, j - h.line - 1);
    h.preview = makePreviewFromLines(lines, h.line + 1, j, 360);
  }
  const root = { name: rootLabel, value: 0, children: /** @type {unknown[]} */ ([]) };
  const stack = [{ level: 0, node: root }];
  for (const h of headings) {
    const node = { name: h.title, value: h.lineCount, preview: h.preview, children: [] };
    while (stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: h.level, node });
  }
  return root;
}

/**
 * Display-math blocks ($$ … $$) from PROTOCOL.md (for spec-viz formula index).
 */
function extractProtocolSupplement(protocolMd) {
  if (!protocolMd) {
    return {
      generatedAt: new Date().toISOString(),
      mathBlocks: [],
      stats: { displayMathBlockCount: 0 },
    };
  }

  const lines = protocolMd.split(/\r?\n/);
  let lastHeading = "Preamble";
  /** @type {{ line: number; heading: string; latex: string; preview: string }[]} */
  const mathBlocks = [];

  let inMath = false;
  /** @type {string[]} */
  let mathBuf = [];
  let mathStartLine = 1;

  function pushMathBlock(body, lineNum) {
    const b = body.trim();
    if (!b) return;
    const maxLatex = 12000;
    const latex = b.length > maxLatex ? `${b.slice(0, maxLatex)}\n\\text{[truncated]}` : b;
    const preview = b.replace(/\s+/g, " ");
    mathBlocks.push({
      line: lineNum,
      heading: lastHeading,
      latex,
      preview: preview.slice(0, 200) + (preview.length > 200 ? "…" : ""),
    });
  }

  function processNonMathLine(line, lineNum) {
    let pos = 0;
    while (pos < line.length) {
      const open = line.indexOf("$$", pos);
      if (open === -1) break;
      const close = line.indexOf("$$", open + 2);
      if (close === -1) {
        inMath = true;
        mathStartLine = lineNum;
        mathBuf = [line.slice(open + 2)];
        break;
      }
      pushMathBlock(line.slice(open + 2, close), lineNum);
      pos = close + 2;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const hm = line.match(/^(#{2,6})\s+(.+)$/);
    if (hm) lastHeading = hm[2].trim();

    if (inMath) {
      const closeIdx = line.indexOf("$$");
      if (closeIdx === -1) {
        mathBuf.push(line);
      } else {
        mathBuf.push(line.slice(0, closeIdx));
        const body = mathBuf.join("\n");
        pushMathBlock(body, mathStartLine);
        mathBuf = [];
        inMath = false;
        processNonMathLine(line.slice(closeIdx + 2), lineNum);
      }
      continue;
    }

    processNonMathLine(line, lineNum);
  }

  return {
    generatedAt: new Date().toISOString(),
    mathBlocks,
    stats: {
      displayMathBlockCount: mathBlocks.length,
    },
  };
}

function walkRsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkRsFiles(p, out);
    else if (name.endsWith(".rs")) out.push(p);
  }
  return out;
}

const SPEC_LOCKED_PATTERN = /spec_locked\s*\(\s*"([^"]+)"\s*\)/g;

/**
 * Section ids omitted from the chord’s top-N pick (isolated ribbons + cramped labels).
 * Keep in sync with SectionChordDiagram / App copy (named there as §5.4.6).
 */
const COOCCURRENCE_CHORD_EXCLUDE = new Set(["5.4.6"]);

function pickTopSectionsForChord(sectionsSorted, limit, exclude) {
  const out = [];
  for (const { section } of sectionsSorted) {
    if (exclude.has(section)) continue;
    out.push(section);
    if (out.length >= limit) break;
  }
  return out;
}

function moduleKey(filePath) {
  const rel = path.relative(CONSENSUS_SRC, filePath).replace(/\\/g, "/");
  const parts = rel.split("/");
  if (parts.length >= 2 && parts[parts.length - 1] === "mod.rs") return parts[parts.length - 2];
  if (parts.length >= 1) return parts[0].replace(/\.rs$/, "");
  return "unknown";
}

function extractSpecLocked() {
  /** @type {Record<string, number>} */
  const bySection = {};
  /** @type {Record<string, Record<string, number>>} */
  const byModule = {};
  /** @type {Record<string, Set<string>>} */
  const fileToSections = {};

  for (const file of walkRsFiles(CONSENSUS_SRC)) {
    const text = fs.readFileSync(file, "utf8");
    const sections = new Set();
    const re = new RegExp(SPEC_LOCKED_PATTERN.source, "g");
    let m;
    while ((m = re.exec(text))) {
      const sec = m[1];
      sections.add(sec);
      bySection[sec] = (bySection[sec] ?? 0) + 1;
    }
    if (sections.size === 0) continue;
    const mod = moduleKey(file);
    if (!byModule[mod]) byModule[mod] = {};
    fileToSections[file] = sections;
    for (const sec of sections) {
      byModule[mod][sec] = (byModule[mod][sec] ?? 0) + 1;
    }
  }

  const sectionsSorted = Object.entries(bySection)
    .sort((a, b) => b[1] - a[1])
    .map(([section, count]) => ({ section, count }));

  const topSections = pickTopSectionsForChord(sectionsSorted, 14, COOCCURRENCE_CHORD_EXCLUDE);
  const index = Object.fromEntries(topSections.map((s, i) => [s, i]));
  const n = topSections.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const sec = topSections[i];
    matrix[i][i] = bySection[sec] ?? 0;
  }

  for (const secs of Object.values(fileToSections)) {
    const arr = [...secs].filter((s) => s in index);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = index[arr[i]];
        const b = index[arr[j]];
        matrix[a][b]++;
        matrix[b][a]++;
      }
    }
  }

  const moduleRows = Object.entries(byModule)
    .map(([module, secs]) => ({
      module,
      total: Object.values(secs).reduce((a, b) => a + b, 0),
      sections: secs,
    }))
    .sort((a, b) => b.total - a.total || a.module.localeCompare(b.module));

  return {
    bySection: sectionsSorted,
    byModule: moduleRows,
    cooccurrenceTopSections: topSections,
    cooccurrenceMatrix: matrix,
    filesWithSpecLock: Object.keys(fileToSections).length,
  };
}

function main() {
  const protocolMd = readIfExists(PROTOCOL);
  const archMd = readIfExists(ARCHITECTURE);

  const protocolOutline = parseMarkdownOutline(protocolMd, "PROTOCOL.md");
  const architectureOutline = parseMarkdownOutline(archMd, "ARCHITECTURE.md");

  const specLocked = extractSpecLocked();
  const protocolSupplement = extractProtocolSupplement(protocolMd);

  const out = {
    generatedAt: new Date().toISOString(),
    repoRelative: {
      protocol: path.relative(REPO, PROTOCOL),
      architecture: path.relative(REPO, ARCHITECTURE),
      consensus: path.relative(REPO, CONSENSUS_SRC),
    },
    protocolOutline,
    architectureOutline,
    orangePaper: {
      name: "Orange Paper",
      value: 0,
      children: [protocolOutline, architectureOutline],
    },
    specLocked,
  };

  const outDir = path.join(SPEC_VIZ, "src/data/generated");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "specViz.data.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${outFile}`);
  console.log(
    `  Sections (spec_locked): ${specLocked.bySection.length}, files: ${specLocked.filesWithSpecLock}`,
  );

  const supFile = path.join(outDir, "specSupplement.data.json");
  fs.writeFileSync(supFile, JSON.stringify(protocolSupplement, null, 2), "utf8");
  console.log(`Wrote ${supFile}`);
  console.log(`  PROTOCOL supplement: ${protocolSupplement.stats.displayMathBlockCount} math blocks`);
}

main();
