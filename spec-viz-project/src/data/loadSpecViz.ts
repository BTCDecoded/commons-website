import raw from "./generated/specViz.data.json";

export interface OutlineNode {
  name: string;
  value: number;
  /** Plain prose preview under this heading (extract; sunburst tooltips). */
  preview?: string;
  children: OutlineNode[];
}

export interface SpecLockedStats {
  bySection: { section: string; count: number }[];
  byModule: { module: string; total: number; sections: Record<string, number> }[];
  cooccurrenceTopSections: string[];
  cooccurrenceMatrix: number[][];
  filesWithSpecLock: number;
}

export interface SpecVizData {
  generatedAt: string;
  repoRelative: {
    protocol: string;
    architecture: string;
    consensus: string;
  };
  protocolOutline: OutlineNode;
  architectureOutline: OutlineNode;
  orangePaper: OutlineNode;
  specLocked: SpecLockedStats;
}

export const specViz = raw as unknown as SpecVizData;
