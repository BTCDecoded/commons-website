/** Block subsidy (satoshis) per §6.1 style halving schedule — for charts only. */

export const HALVING_INTERVAL = 210_000;
export const INITIAL_SUBSIDY_SAT = 5_000_000_000; // 50 BTC
/** Target inter-block time — PROTOCOL §4.4 (`T_block`). */
export const TARGET_BLOCK_INTERVAL_SEC = 600;

/** Blocks per calendar year at exactly 600 s spacing (~365.25-day year). */
export function blocksPerYear(): number {
  return (365.25 * 24 * 3600) / TARGET_BLOCK_INTERVAL_SEC;
}

/** Integer halving like consensus: subsidy in satoshis at height. */
export function blockSubsidySat(height: number): number {
  const halvings = Math.floor(height / HALVING_INTERVAL);
  if (halvings >= 64) return 0;
  return Math.floor(INITIAL_SUBSIDY_SAT / 2 ** halvings);
}

/** Nominal new issuance rate (BTC/year) from coinbase only at `height`, ignoring fees. */
export function annualizedIssuanceBtc(height: number): number {
  return (blockSubsidySat(height) / 1e8) * blocksPerYear();
}

/** Sample points for line charts (height, subsidy BTC). */
export function subsidySamples(
  maxHeight: number,
  step: number,
): { height: number; btc: number; sat: number }[] {
  const out: { height: number; btc: number; sat: number }[] = [];
  for (let h = 0; h <= maxHeight; h += step) {
    const sat = blockSubsidySat(h);
    out.push({ height: h, sat, btc: sat / 1e8 });
  }
  return out;
}

const MAX_SUPPLY_BTC = 21_000_000;

/** Cumulative issued supply (sum of coinbase subsidies) — approaches ~21M BTC (§6.2). */
export function cumulativeSupplyBtc(
  maxHeight: number,
  step: number,
): { height: number; btc: number }[] {
  let sumSat = 0;
  const out: { height: number; btc: number }[] = [];
  for (let h = 0; h <= maxHeight; h++) {
    sumSat += blockSubsidySat(h);
    if (h % step === 0 || h === maxHeight) {
      out.push({ height: h, btc: sumSat / 1e8 });
    }
  }
  return out;
}

export { MAX_SUPPLY_BTC };
