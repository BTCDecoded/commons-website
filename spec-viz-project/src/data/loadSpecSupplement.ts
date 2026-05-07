import raw from "./generated/specSupplement.data.json";

export interface MathBlockEntry {
  line: number;
  heading: string;
  /** Full display-math body for KaTeX (preferred). Older extracts may omit this. */
  latex?: string;
  preview: string;
}

export interface SpecSupplementData {
  generatedAt: string;
  mathBlocks: MathBlockEntry[];
  stats: {
    displayMathBlockCount: number;
  };
}

export const specSupplement = raw as unknown as SpecSupplementData;
