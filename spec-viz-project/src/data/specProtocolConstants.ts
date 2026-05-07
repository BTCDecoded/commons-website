/**
 * Scalar constants called out early in PROTOCOL.md (§4) plus $T_{\mathrm{expected}}$ from §7.1.
 * Hand-curated for the panel; keep aligned with `blvm-spec/PROTOCOL.md`.
 */

export interface ProtocolScalar {
  symbol: string;
  displayValue: string;
  specRef: string;
  note: string;
}

export const protocolScalars: ProtocolScalar[] = [
  {
    symbol: "C",
    displayValue: "10⁸",
    specRef: "§4.1",
    note: "satoshis per BTC",
  },
  {
    symbol: "M_max",
    displayValue: "21×10⁶×C sat",
    specRef: "§4.1 / §6.2",
    note: "maximum money supply",
  },
  {
    symbol: "H",
    displayValue: "210,000 blocks",
    specRef: "§4.1 / §6.1",
    note: "halving interval",
  },
  {
    symbol: "W_max",
    displayValue: "4×10⁶",
    specRef: "§4.2 / §5.3",
    note: "maximum block weight",
  },
  {
    symbol: "S_max",
    displayValue: "80,000",
    specRef: "§4.2 / §5.2",
    note: "maximum sigop cost per block",
  },
  {
    symbol: "R",
    displayValue: "100 blocks",
    specRef: "§4.2 / §5.1",
    note: "coinbase maturity",
  },
  {
    symbol: "L_script",
    displayValue: "10,000 bytes",
    specRef: "§4.3",
    note: "maximum script length",
  },
  {
    symbol: "L_stack",
    displayValue: "1,000",
    specRef: "§4.3",
    note: "maximum stack size",
  },
  {
    symbol: "L_ops",
    displayValue: "201",
    specRef: "§4.3",
    note: "maximum operations per script",
  },
  {
    symbol: "L_element",
    displayValue: "520 bytes",
    specRef: "§4.3 / §5.2",
    note: "maximum stack element size",
  },
  {
    symbol: "D_interval",
    displayValue: "2016 blocks",
    specRef: "§4.4 / §7.1",
    note: "difficulty adjustment period length",
  },
  {
    symbol: "T_block",
    displayValue: "600 s",
    specRef: "§4.4",
    note: "target inter-block time",
  },
  {
    symbol: "T_future",
    displayValue: "7200 s",
    specRef: "§4.4 / §5.3",
    note: "max header time in the future (2 h)",
  },
  {
    symbol: "T_expected",
    displayValue: "1,209,600 s (14 days)",
    specRef: "§7.1",
    note: "expected span of a difficulty period in the retarget formula",
  },
];
