/**
 * Single source of truth for sunburst layout size (must match SectionSunburst useMemo).
 * Used by the index2 embed height bridge so the iframe is never shorter than the chart.
 */
export const SUNBURST_RADIUS_PX = 232;
export const SUNBURST_LABEL_MARGIN_PX = 200;
export const SUNBURST_SVG_SIZE_PX = SUNBURST_RADIUS_PX * 2 + SUNBURST_LABEL_MARGIN_PX;
