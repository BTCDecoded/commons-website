import type { OutlineNode } from "./loadSpecViz";

/** Which markdown file a blacklist entry applies to (`any` = both). */
export type OutlineDocScope = "protocol" | "architecture" | "any";

/**
 * Default outline viz policy (sunburst / icicle). We hide subtrees that are not good “at a glance”
 * navigation into **operational Bitcoin rules and algorithms**:
 *
 * 1. **Document framing** — title line, abstract, introduction (positioning / roadmap, not rules).
 * 2. **Formal preliminaries** — system model and assumptions (sets up notation; not direct consensus predicates).
 * 3. **Meta verification** — security theorems and proof-heavy text *about* the protocol’s properties (distinct from rule definitions elsewhere).
 * 4. **Wrap-up & bibliography** — conclusions, references.
 * 5. **Implementation gloss** — very short non-algorithmic bullet sections in architecture (performance / security checklists).
 *
 * Everything else (constants, state transitions, script, network, mining, architecture algorithms, etc.)
 * stays visible. Use `?outline=full` on the viz URL for the complete heading tree.
 *
 * Headings must match `OutlineNode.name` exactly (same string as `##` … `######` lines in the markdown).
 * Optional math-density–based pruning could use `specSupplement.data.json` later to avoid duplicating titles.
 */
export type SpecOutlineBlacklistEntry = {
  headingTitle: string;
  doc: OutlineDocScope;
  /** Maintainer note: ties this row to the policy bullets above. */
  reason: string;
};

export const SPEC_OUTLINE_BLACKLIST: readonly SpecOutlineBlacklistEntry[] = [
  /* ── PROTOCOL.md: framing ───────────────────────────────────────── */
  {
    doc: "protocol",
    headingTitle: "A Complete Mathematical Description of the Bitcoin Consensus System",
    reason: "Policy §1: document title / framing, not a rule section.",
  },
  {
    doc: "protocol",
    headingTitle: "Abstract",
    reason: "Policy §1: summary prose; not executable protocol content.",
  },
  {
    doc: "protocol",
    headingTitle: "1. Introduction",
    reason: "Policy §1: roadmap and positioning; whole subtree (incl. Key Contributions, Document Structure).",
  },
  /* ── PROTOCOL.md: preliminaries & meta proofs ───────────────────── */
  {
    doc: "protocol",
    headingTitle: "2. System Model",
    reason: "Policy §2: participants and network assumptions; formal setup, not consensus predicates.",
  },
  {
    doc: "protocol",
    headingTitle: "8. Security Properties",
    reason:
      "Policy §3: theorems, lemmas, and proofs about the protocol (economic/crypto/determinism properties).",
  },
  /* ── ARCHITECTURE.md: gloss & wrap-up ───────────────────────────── */
  {
    doc: "architecture",
    headingTitle: "13.1 Performance",
    reason: "Policy §5: short implementation bullet list, not a specified algorithm.",
  },
  {
    doc: "architecture",
    headingTitle: "13.2 Security",
    reason: "Policy §5: short implementation bullet list, not a specified algorithm.",
  },
  {
    doc: "architecture",
    headingTitle: "14. Conclusion",
    reason: "Policy §4: closing narrative; subtree includes Summary of Contributions and Applications.",
  },
  {
    doc: "architecture",
    headingTitle: "References",
    reason: "Policy §4: bibliography; subtree includes citation groupings.",
  },
];

function isBlacklistedHeading(name: string, doc: "protocol" | "architecture"): boolean {
  const t = name.trim();
  for (const e of SPEC_OUTLINE_BLACKLIST) {
    if (e.doc !== "any" && e.doc !== doc) continue;
    if (t === e.headingTitle.trim()) return true;
  }
  return false;
}

/** Mutates nothing; returns a new tree with blacklisted subtrees removed. */
function pruneOrangePaperOutlineCloned(root: OutlineNode): OutlineNode {
  function walk(node: OutlineNode, doc: "protocol" | "architecture" | null): OutlineNode {
    let activeDoc = doc;
    if (node.name === "PROTOCOL.md") activeDoc = "protocol";
    else if (node.name === "ARCHITECTURE.md") activeDoc = "architecture";

    const nextChildren: OutlineNode[] = [];
    for (const c of node.children ?? []) {
      if (activeDoc !== null && isBlacklistedHeading(c.name, activeDoc)) continue;
      nextChildren.push(walk(c, activeDoc));
    }
    return { ...node, children: nextChildren };
  }
  return walk(root, null);
}

/**
 * Orange Paper outline for partition charts. By default drops sections listed in
 * {@link SPEC_OUTLINE_BLACKLIST}. Append `?outline=full` to the page URL to show the complete tree.
 */
export function getOrangePaperForOutlineViz(raw: OutlineNode): OutlineNode {
  const root = structuredClone(raw);
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("outline") === "full") {
    return root;
  }
  return pruneOrangePaperOutlineCloned(root);
}
