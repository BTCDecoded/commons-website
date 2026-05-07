/** Difficulty retarget helpers — Orange Paper §7.1 (`GetNextWorkRequired` / `ClampTime`). */

export const T_EXPECTED_SEC = 14 * 24 * 60 * 60; // 1_209_600

/** $\mathrm{ClampTime}(t) := \max(T/4, \min(4T, t))$ with $T = T_{\mathrm{expected}}$. */
export function clampTimeSec(rawDeltaSec: number): number {
  const lo = T_EXPECTED_SEC / 4;
  const hi = 4 * T_EXPECTED_SEC;
  return Math.max(lo, Math.min(hi, rawDeltaSec));
}

/** Ratio $\tau / T_{\mathrm{expected}}$ after clamping, for $\tau$ the measured period timespan. */
export function clampedTimespanRatio(rawDeltaSec: number): number {
  return clampTimeSec(rawDeltaSec) / T_EXPECTED_SEC;
}
