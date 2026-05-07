/**
 * Mainnet activation heights for the soft-fork timeline — same numbers as the Orange Paper
 * (`blvm-spec/PROTOCOL.md`): BIP validation rules (§5.4.x) and script-verify flag gates (§5.1).
 * Hand-listed here for the chart (not generated from Markdown); keep in sync if the spec changes.
 */

export interface ActivationMarker {
  id: string;
  height: number;
  label: string;
  color: string;
}

export const mainnetActivations: ActivationMarker[] = [
  { id: "bip16", height: 173_805, label: "BIP16 P2SH", color: "#64748b" },
  { id: "bip34", height: 227_931, label: "BIP34 coinbase height", color: "#ea580c" },
  { id: "bip66", height: 363_725, label: "BIP66 strict DER", color: "#a855f7" },
  { id: "bip65", height: 388_381, label: "BIP65 CLTV", color: "#0ea5e9" },
  { id: "csv", height: 419_328, label: "BIP68/112/113 CSV", color: "#14b8a6" },
  { id: "segwit", height: 481_824, label: "SegWit (BIP141/143/147)", color: "#2563eb" },
  { id: "taproot", height: 709_632, label: "Taproot (BIP340-342)", color: "#16a34a" },
];

export const activationAxisMax = 800_000;

/** Shaded eras behind the activation strip — heights align with SegWit / Taproot deployments above. */
export interface MainnetEraBand {
  id: string;
  label: string;
  fromHeight: number;
  /** Inclusive upper bound for painting (matches axis max). */
  toHeight: number;
  fill: string;
}

export const mainnetEraBands: MainnetEraBand[] = [
  {
    id: "pre-segwit",
    label: "Pre-SegWit",
    fromHeight: 0,
    toHeight: 481_823,
    fill: "rgba(100, 116, 139, 0.18)",
  },
  {
    id: "segwit",
    label: "SegWit era",
    fromHeight: 481_824,
    toHeight: 709_631,
    fill: "rgba(37, 99, 235, 0.14)",
  },
  {
    id: "taproot",
    label: "Taproot era",
    fromHeight: 709_632,
    toHeight: activationAxisMax,
    fill: "rgba(22, 163, 74, 0.14)",
  },
];
