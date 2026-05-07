/**
 * Function composition graphs: composite nodes decompose into primitives along directed edges.
 * Edge direction: parent --composed_of--> child (parent invokes / is defined in terms of child).
 *
 * Data is curated from Orange Paper structure + blvm-consensus call flow (e.g. connect_block).
 * Future: generate from Rust AST, spec-lock attributes, or PROPERTY_BINDINGS.toml pipelines.
 */

export type NodeKind = "composite" | "primitive";

export interface CompNode {
  id: string;
  /** Short label for the diagram */
  label: string;
  kind: NodeKind;
  /** Orange Paper section when applicable */
  specRef?: string;
  /** Rust path or symbol (informative) */
  implHint?: string;
}

export interface CompEdge {
  from: string;
  to: string;
  /** Why this edge exists (optional) */
  note?: string;
}

export interface CompositionGraphData {
  id: string;
  title: string;
  description: string;
  rootId: string;
  nodes: CompNode[];
  edges: CompEdge[];
}

/** ConnectBlock / connect_block_inner — main consensus block hook-up (PROTOCOL §5.3, ARCHITECTURE). */
export const connectBlockComposition: CompositionGraphData = {
  id: "connect-block",
  title: "ConnectBlock decomposition",
  description:
    "How block connection fans out into header checks, Merkle / witness structure, per-tx validation, " +
    "economic checks, and UTXO application. Leaf nodes are primitives (hashes, crypto, ledger ops).",
  rootId: "connect_block",
  nodes: [
    {
      id: "connect_block",
      label: "ConnectBlock",
      kind: "composite",
      specRef: "§5.3",
      implHint: "blvm_consensus::block::connect_block",
    },
    {
      id: "validate_block_header",
      label: "ValidateBlockHeader",
      kind: "composite",
      specRef: "§7.2",
      implHint: "block::header::validate_block_header",
    },
    {
      id: "block_weight",
      label: "Block weight (SegWit)",
      kind: "composite",
      specRef: "§11.1",
      implHint: "segwit::calculate_block_weight_from_nested",
    },
    {
      id: "bip90",
      label: "BIP90 version rules",
      kind: "composite",
      specRef: "§5.4.4",
      implHint: "bip_validation::check_bip90",
    },
    {
      id: "tx_merkle",
      label: "Tx Merkle root check",
      kind: "composite",
      specRef: "§8.4",
      implHint: "mining::compute_merkle_root_and_mutated",
    },
    {
      id: "check_tx",
      label: "CheckTransaction",
      kind: "composite",
      specRef: "§5.1",
      implHint: "transaction::check_transaction",
    },
    {
      id: "script_path",
      label: "Script verify + inputs",
      kind: "composite",
      specRef: "§5.1–5.2",
      implHint: "script / check_tx_inputs / batch verify",
    },
    {
      id: "coinbase_econ",
      label: "Coinbase ≤ subsidy + fees",
      kind: "composite",
      specRef: "§5.3",
      implHint: "get_block_subsidy + fee tally",
    },
    {
      id: "get_subsidy",
      label: "GetBlockSubsidy",
      kind: "composite",
      specRef: "§6.1",
      implHint: "economic::get_block_subsidy",
    },
    {
      id: "halving_schedule",
      label: "Height → subsidy (halving)",
      kind: "primitive",
      specRef: "§6.1",
      implHint: "bit shift / epoch math",
    },
    {
      id: "witness_commit",
      label: "Witness commitment",
      kind: "composite",
      specRef: "§11.1",
      implHint: "segwit::validate_witness_commitment",
    },
    {
      id: "apply_tx",
      label: "ApplyTransaction",
      kind: "composite",
      specRef: "§5.3",
      implHint: "block::apply::apply_transaction",
    },
    {
      id: "sha256d",
      label: "SHA-256d",
      kind: "primitive",
      specRef: "§3",
      implHint: "double SHA-256",
    },
    {
      id: "merkle_pair",
      label: "Merkle pair hash",
      kind: "primitive",
      specRef: "§8.4",
      implHint: "concat + sha256d",
    },
    {
      id: "secp_verify",
      label: "ECDSA / Schnorr verify",
      kind: "primitive",
      specRef: "§5.2",
      implHint: "secp256k1",
    },
    {
      id: "utxo_read",
      label: "UTXO lookup",
      kind: "primitive",
      specRef: "§5.1",
      implHint: "OutPoint → UTXO",
    },
    {
      id: "utxo_write",
      label: "UTXO apply / undo",
      kind: "primitive",
      specRef: "§5.3 / §11.3.1",
      implHint: "spend + create outputs",
    },
  ],
  edges: [
    { from: "connect_block", to: "validate_block_header", note: "header first" },
    { from: "connect_block", to: "block_weight", note: "DoS bound" },
    { from: "connect_block", to: "bip90", note: "version vs height" },
    { from: "connect_block", to: "tx_merkle", note: "matches header.merkle_root" },
    { from: "connect_block", to: "check_tx", note: "each non-coinbase tx" },
    { from: "connect_block", to: "script_path", note: "after structural tx valid" },
    { from: "connect_block", to: "coinbase_econ", note: "subsidy + fees" },
    { from: "connect_block", to: "witness_commit", note: "SegWit blocks" },
    { from: "connect_block", to: "apply_tx", note: "mutate UTXO set" },
    { from: "tx_merkle", to: "merkle_pair", note: "tree levels" },
    { from: "merkle_pair", to: "sha256d", note: "hashed pair" },
    { from: "check_tx", to: "sha256d", note: "txid / sighash uses" },
    { from: "script_path", to: "secp_verify", note: "signatures" },
    { from: "script_path", to: "utxo_read", note: "prevouts" },
    { from: "coinbase_econ", to: "get_subsidy", note: "height → subsidy" },
    { from: "get_subsidy", to: "halving_schedule", note: "50 BTC → …" },
    { from: "witness_commit", to: "sha256d", note: "wtxid tree" },
    { from: "apply_tx", to: "utxo_write", note: "delta" },
  ],
};

/** Smaller graph: transaction-level check only. */
export const checkTransactionComposition: CompositionGraphData = {
  id: "check-tx",
  title: "CheckTransaction decomposition",
  description:
    "Structural and contextual checks before script execution; edges are illustrative of typical call structure.",
  rootId: "check_transaction",
  nodes: [
    {
      id: "check_transaction",
      label: "CheckTransaction",
      kind: "composite",
      specRef: "§5.1",
      implHint: "transaction::check_transaction",
    },
    {
      id: "consensus_std",
      label: "Consensus standardness",
      kind: "composite",
      specRef: "§5.1",
      implHint: "sizes, duplicate, value",
    },
    {
      id: "script_flags",
      label: "Script flags / taproot context",
      kind: "composite",
      specRef: "§5.2",
      implHint: "verify_script*",
    },
    {
      id: "hash_ops",
      label: "Hash & sighash",
      kind: "primitive",
      specRef: "§5.2",
      implHint: "SHA-256d, BIP143…",
    },
    {
      id: "stack_machine",
      label: "Stack interpreter",
      kind: "primitive",
      specRef: "§5.2",
      implHint: "opcodes + limits",
    },
  ],
  edges: [
    { from: "check_transaction", to: "consensus_std" },
    { from: "check_transaction", to: "script_flags" },
    { from: "script_flags", to: "hash_ops" },
    { from: "script_flags", to: "stack_machine" },
  ],
};

export const compositionGraphs: CompositionGraphData[] = [
  connectBlockComposition,
  checkTransactionComposition,
];
