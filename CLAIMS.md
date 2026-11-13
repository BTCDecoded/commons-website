# Where public numbers on this site come from

The Pages build writes these. A committed copy can be stale until the next build.

| Number | Produced by | Source |
|---|---|---|
| BLVM release badge and `assets/blvm-release.json` | `scripts/fetch-blvm-release-meta.mjs` | GitHub releases for `BTCDecoded/blvm` |
| Ecosystem size, rules, and author rows | `scripts/render-ecosystem.mjs` | `data/implementations.json` |
| Formal verification levels | `scripts/build-verification-evidence.mjs`, then the render | spec-lock README body-proof list, `docs/MUTATION_COVERAGE.md`, `docs/sentence-inventory.tsv`, `SPEC_LOCK_COVERAGE.md`, and `blvm-consensus/docs/VERIFICATION.md` |
| Formal verification counts | `scripts/ecosystem-charts/25-spec-proof.mjs` | Two counts on the page: spec_locked annotations, and functions proved from the body. Each count has a title. The Lean inventory and the older lists are behind the disclosure. There is no shared bar and no coverage percent. |

Function lists are labeled and are not added together. A passing spec-lock contract check is not a proof. The `spec_locked` attribute count is not a count of passing checks.

`scripts/check-public-claims.mjs` fails the build on "100% verified", "100% Z3", "governance solved", "zero divergence", "6x harder", "harder to capture", and "nearly two years", unless `data/claims-allow.json` names the file, the phrase id, and an `https://` evidence link.
