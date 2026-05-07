import type { SpecVizData } from "./loadSpecViz";

type ModuleRow = SpecVizData["specLocked"]["byModule"][number];

/**
 * Modules that should appear in matrix/network views whenever they have any `spec_locked` data,
 * even if `lib.rs` wrappers dominate the global sort by hit count.
 */
export const PINNED_MODULES = ["economic", "taproot"] as const;

/**
 * Prefer pinned modules, then fill by descending total (caller should pass pre-sorted rows).
 */
export function pickModulesForViz(
  sortedRows: ModuleRow[],
  limit: number,
  pins: readonly string[] = PINNED_MODULES,
): ModuleRow[] {
  const map = new Map(sortedRows.map((r) => [r.module, r]));
  const seen = new Set<string>();
  const out: ModuleRow[] = [];
  for (const p of pins) {
    const r = map.get(p);
    if (r) {
      out.push(r);
      seen.add(p);
    }
  }
  for (const r of sortedRows) {
    if (out.length >= limit) break;
    if (!seen.has(r.module)) {
      out.push(r);
      seen.add(r.module);
    }
  }
  return out;
}
