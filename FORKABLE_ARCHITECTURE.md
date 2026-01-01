# Forkable Architecture: Complete System Explanation

## Overview

Bitcoin Commons has **three types of forking** that work at different levels:

1. **Governance Forks** (what we just implemented) - Fork governance rulesets
2. **Code Forks** - Fork individual repositories/layers
3. **Module Forks** - Fork optional feature modules

All three maintain Bitcoin consensus compatibility - they don't fork the blockchain.

---

## The 6-Tier Architecture

Bitcoin Commons uses a **6-tier layered architecture** where each tier builds on the previous:

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Orange Paper (Mathematical Foundation)        │
│ - Purpose: Timeless consensus rules (mathematical spec)  │
│ - Type: Documentation/Specification                      │
│ - Governance: Constitutional (6-of-7, 180 days)          │
│ - Forkable: ✅ Yes (specification fork)                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: blvm-consensus (Pure Math Implementation)    │
│ - Purpose: Direct implementation of Orange Paper       │
│ - Type: Rust library (pure functions, no side effects)  │
│ - Governance: Constitutional (6-of-7, 180 days)          │
│ - Forkable: ✅ Yes (implementation fork)                 │
│ - Key Functions: CheckTransaction, ConnectBlock, etc.   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: blvm-protocol (Protocol Abstraction)          │
│ - Purpose: Bitcoin variant abstraction (mainnet/testnet)│
│ - Type: Rust library                                    │
│ - Governance: Implementation (4-of-5, 90 days)            │
│ - Forkable: ✅ Yes (protocol fork)                       │
│ - Supports: Multiple Bitcoin variants                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: blvm-node (Full Bitcoin Node)                 │
│ - Purpose: Complete Bitcoin implementation              │
│ - Type: Rust binaries (full node)                       │
│ - Governance: Application (3-of-5, 60 days)             │
│ - Forkable: ✅ Yes (node fork)                           │
│ - Components: Validation, storage, P2P, RPC, mining     │
│ - Includes: Module system for optional features         │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 5: blvm-sdk (Developer Toolkit)                  │
│ - Purpose: Governance crypto + module composition       │
│ - Type: Rust library and CLI tools                      │
│ - Governance: Extension (2-of-3, 14 days)                │
│ - Forkable: ✅ Yes (SDK fork)                            │
│ - Components: Key gen, signing, verification, multisig   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 6: governance + blvm-commons (Enforcement)      │
│ - Purpose: Cryptographic governance enforcement         │
│ - Type: Configuration + GitHub App                      │
│ - Governance: Extension (2-of-3, 14 days)                │
│ - Forkable: ✅ Yes (governance fork - what we built!)   │
│ - Components: GitHub integration, signature verification│
└─────────────────────────────────────────────────────────┘
```

---

## What Can Be Forked at Each Level

### Layer 1: Orange Paper (Specification Fork)
- **What**: Mathematical specification of Bitcoin consensus
- **Fork Type**: Specification/documentation fork
- **Impact**: Changes how consensus is mathematically defined
- **Example**: Alternative mathematical formulation of consensus rules
- **Governance**: 6-of-7 maintainers, 180 days (365 for consensus changes)

### Layer 2: blvm-consensus (Implementation Fork)
- **What**: Pure mathematical implementation of consensus rules
- **Fork Type**: Code fork (Rust library)
- **Impact**: Different implementation of same mathematical functions
- **Example**: Alternative algorithm for CheckTransaction, different optimization
- **Governance**: 6-of-7 maintainers, 180 days (365 for consensus changes)
- **Note**: Must maintain mathematical equivalence to Orange Paper

### Layer 3: blvm-protocol (Protocol Fork)
- **What**: Protocol abstraction layer
- **Fork Type**: Code fork (Rust library)
- **Impact**: Different protocol variants, network parameters
- **Example**: New Bitcoin variant (e.g., Bitcoin V2), different testnet parameters
- **Governance**: 4-of-5 maintainers, 90 days
- **Note**: Uses blvm-consensus, cannot change consensus rules

### Layer 4: blvm-node (Node Fork)
- **What**: Full Bitcoin node implementation
- **Fork Type**: Code fork (Rust binaries)
- **Impact**: Different node features, storage, networking
- **Example**: Alternative storage backend, different RPC API, custom P2P protocol
- **Governance**: 3-of-5 maintainers, 60 days
- **Note**: Uses blvm-protocol + blvm-consensus, cannot change consensus
- **Special**: Includes module system (see Modules section below)

### Layer 5: blvm-sdk (SDK Fork)
- **What**: Developer toolkit and governance primitives
- **Fork Type**: Code fork (Rust library + CLI tools)
- **Impact**: Different developer APIs, governance tools
- **Example**: Alternative key management, different signing schemes
- **Governance**: 2-of-3 maintainers, 14 days
- **Note**: Standalone, no consensus dependencies

### Layer 6: governance + blvm-commons (Governance Fork)
- **What**: Governance rulesets and enforcement
- **Fork Type**: Configuration fork (what we just built!)
- **Impact**: Different governance rules (signature thresholds, review periods)
- **Example**: Conservative governance, agile governance, community-driven
- **Governance**: 2-of-3 maintainers, 14 days
- **Note**: This is what the website's fork tool handles

---

## Modules: The Missing Piece

### What Are Modules?

Modules are **optional, process-isolated features** that extend blvm-node (Layer 4) without affecting consensus:

- **Lightning Network**: Layer 2 payment channels
- **Merge Mining**: Auxiliary proof-of-work
- **Privacy Enhancements**: Coin mixing, confidential transactions
- **Custom Features**: Any non-consensus feature

### Module Architecture

```
blvm-node (Layer 4)
├── Core Node (consensus validation, storage, P2P)
└── Module System
    ├── Module 1: Lightning Network
    ├── Module 2: Merge Mining
    ├── Module 3: Privacy Features
    └── Module N: Custom Module
```

### Key Properties

1. **Process Isolation**: Each module runs in separate process
2. **Consensus Isolation**: Modules cannot modify consensus rules
3. **API Boundaries**: Modules communicate via IPC only
4. **Crash Containment**: Module failures don't affect base node
5. **User Choice**: Users enable/disable modules independently

### Should Modules Be Forkable?

**YES!** Modules should absolutely be forkable because:

1. **User Sovereignty**: Users should choose which modules to run
2. **Competition**: Multiple implementations of same feature (e.g., Lightning)
3. **Innovation**: Experimental modules can be tested safely
4. **Commons Principle**: "Code is a commons" applies to modules too

### Module Fork Types

1. **Module Implementation Fork**: Different implementation of same feature
   - Example: Alternative Lightning implementation
   - Impact: Same API, different internals

2. **Module Configuration Fork**: Same module, different settings
   - Example: Lightning with different fee structure
   - Impact: Configuration-level fork

3. **Module Registry Fork**: Different set of available modules
   - Example: Curated module marketplace
   - Impact: Discovery and distribution fork

---

## Complete Forkability Matrix

| Level | Component | Fork Type | Governance | Impact | Website Support |
|-------|-----------|-----------|------------|--------|-----------------|
| **Layer 1** | Orange Paper | Specification | 6-of-7, 180d | Consensus definition | ❌ Not yet |
| **Layer 2** | blvm-consensus | Code | 6-of-7, 180d | Implementation | ❌ Not yet |
| **Layer 3** | blvm-protocol | Code | 4-of-5, 90d | Protocol variant | ❌ Not yet |
| **Layer 4** | blvm-node | Code | 3-of-5, 60d | Node features | ❌ Not yet |
| **Layer 5** | blvm-sdk | Code | 2-of-3, 14d | Developer tools | ❌ Not yet |
| **Layer 6** | governance | Configuration | 2-of-3, 14d | Governance rules | ✅ **Implemented!** |
| **Modules** | Lightning, etc. | Code/Config | Varies | Optional features | ❌ Not yet |

---

## How Forking Works Together

### Independent Forking

Each level can be forked **independently**:

- You can fork governance (Layer 6) without forking code (Layers 1-5)
- You can fork blvm-node (Layer 4) while using standard governance
- You can fork modules while using standard node

### Dependency Rules

**Upward Dependencies** (higher layers depend on lower):
- Layer 4 (node) depends on Layer 3 (protocol) + Layer 2 (consensus)
- Layer 3 (protocol) depends on Layer 2 (consensus)
- Layer 2 (consensus) depends on Layer 1 (Orange Paper)

**Downward Dependencies** (lower layers cannot depend on higher):
- Layer 1 cannot depend on Layer 2-6
- Layer 2 cannot depend on Layer 3-6
- etc.

### Fork Compatibility

When forking, you must maintain compatibility with dependencies:

- **Forking Layer 4**: Must work with Layer 3 + Layer 2 (or fork those too)
- **Forking Layer 3**: Must work with Layer 2 (or fork that too)
- **Forking Layer 6**: Independent (governance doesn't affect code)

---

## What Should Be Added to the Website?

### Currently Implemented ✅
- **Governance Forks** (Layer 6): Complete with registry, genealogy, sharing
- **All 10 Governance Dimensions Forkable**: Action tiers, economic nodes, nested multisig teams, governance review policy, repository layers, tier classification, emergency procedures, cross-layer rules, commons contributor thresholds, validation requirements

### Should Be Added 🔄

1. **Module Registry** (High Priority)
   - Browse available modules
   - Fork module configurations
   - Module genealogy tree
   - One-click module installation

2. **Code Fork Registry** (Medium Priority)
   - Registry of forked repositories
   - Layer-by-layer fork tracking
   - Dependency compatibility checking
   - Fork adoption metrics

3. **Unified Fork Dashboard** (Low Priority)
   - View all forks (governance + code + modules)
   - Cross-fork compatibility matrix
   - Fork combination tool

---

## Recommendations

### Immediate: Add Module Support

Modules are the **most user-facing** forkable component and should be next:

1. **Module Registry**: Similar to governance fork registry
2. **Module Marketplace**: Browse, compare, install modules
3. **Module Forking**: Fork module implementations/configurations
4. **Module Genealogy**: Track module evolution

### Future: Code Fork Support

Code forks (Layers 1-5) are more complex but valuable:

1. **Repository Fork Registry**: Track code forks per layer
2. **Dependency Compatibility**: Check if forks work together
3. **Fork Combination Tool**: Combine governance + code + module forks

---

## Summary

**Three Fork Types:**
1. **Governance Forks** (Layer 6) - ✅ Implemented
2. **Code Forks** (Layers 1-5) - ❌ Not yet
3. **Module Forks** (Layer 4 modules) - ❌ Not yet (should be next!)

**All maintain Bitcoin consensus compatibility** - they fork governance/implementation/features, not the blockchain.

**Modules should definitely be included** - they're user-facing, optional, and perfect for the "code as commons" philosophy.

