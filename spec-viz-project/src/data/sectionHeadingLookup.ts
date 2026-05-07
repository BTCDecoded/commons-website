import type { OutlineNode } from "./loadSpecViz";

/**
 * Major sections: `5. Title` (dot after the chapter digit). Subsections: `5.1.1 Title`.
 * Optional `\.?` before whitespace so both shapes match.
 */
const SECTION_ID = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/;
const LEADING_SECTION_NUM = /^\d+(?:\.\d+)*\.?\s+/;

/**
 * Map Orange Paper section ids (e.g. `5.1.1`) to the heading title after the number
 * (e.g. `Transaction Sighash Calculation`), by walking the merged outline tree.
 */
export function buildSectionIdToTitle(root: OutlineNode): Map<string, string> {
  const map = new Map<string, string>();
  function walk(n: OutlineNode) {
    const m = SECTION_ID.exec(n.name.trim());
    if (m) map.set(m[1], m[2].trim());
    n.children?.forEach(walk);
  }
  walk(root);
  return map;
}

/** Drop leading `5.`, `11.2.1`, etc. from a heading line for chart labels. */
export function stripLeadingSectionNumber(line: string): string {
  return line.replace(LEADING_SECTION_NUM, "").trim();
}

/**
 * Display title for viz: no numeric prefix; prefer "SegWit" over "Segregated Witness (SegWit)".
 */
export function friendlyHeadingTitle(raw: string): string {
  let s = stripLeadingSectionNumber(raw).replace(/\s+/g, " ").trim();
  s = s.replace(/\bSegregated Witness\s*\(\s*SegWit\s*\)/gi, "SegWit");
  s = s.replace(/\bSegregated Witness\b/gi, "SegWit");
  return s;
}

export function truncateFriendlyHeading(raw: string, maxLen: number): string {
  const t = friendlyHeadingTitle(raw);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** Section id → short label for axes (uses outline title when present). */
export function sectionIdToVizLabel(
  sectionId: string,
  idToTitle: Map<string, string>,
  maxLen = 28,
): string {
  const raw = idToTitle.get(sectionId);
  if (!raw) return sectionId;
  return truncateFriendlyHeading(raw, maxLen);
}

/** Strip leading `§` id from labels for compact display. */
export function titleForChordSubtitle(fullTitle: string, maxLen = 36): string {
  return truncateFriendlyHeading(fullTitle, maxLen);
}

/**
 * Chord-only titles: Orange Paper uses “Block Validation” under both §5 (state transition) and §7 (PoW).
 */
const CHORD_SECTOR_TITLE_OVERRIDE: Readonly<Record<string, string>> = {
  "5.3": "State Transition Validation",
  "7.2": "Proof of Work Validation",
};

function chordFriendlyTitle(sectionId: string, rawTitle: string): string {
  const o = CHORD_SECTOR_TITLE_OVERRIDE[sectionId];
  if (o) return o;
  return friendlyHeadingTitle(rawTitle);
}

/**
 * Chord sector label: `id · friendly title` so distinct sections (e.g. `5.3` vs `7.2`) never look identical
 * when the outline heading text repeats.
 */
export function formatChordSectorLabel(
  sectionId: string,
  rawTitle: string | undefined,
  maxLen = 46,
): string {
  if (!rawTitle) return sectionId;
  const combined = `${sectionId} · ${chordFriendlyTitle(sectionId, rawTitle)}`;
  if (combined.length <= maxLen) return combined;
  return `${combined.slice(0, Math.max(1, maxLen - 1))}…`;
}
