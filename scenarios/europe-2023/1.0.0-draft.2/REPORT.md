# europe-2023 1.0.0-draft.2 (review draft, not distributable)

This package supersedes 1.0.0-draft.1, which is kept unchanged. It was built by WORLD-03-FINAL: 2023 budget balances calibrated, excess revenue corrected, Greece starting at 164% debt, and the blocs made economic aggregates.

- Full report: [`docs/world/WORLD-03-FINAL-REPORT.md`](../../../docs/world/WORLD-03-FINAL-REPORT.md)
- Validation: `validation-report.json` (22 pass, 1 warning, 0 fail)
- Benchmarks: `benchmark-node.json`, `benchmark-browser.json` (Chromium only, not an iPhone)
- **Not distributable:** Türkiye's spending lines come from a source without published reuse terms (`manifest.json` → `notDistributableBecause`).
- **Engine requirement:** the opt-in inputs `maxStartingDebt`, `economicAggregate` and `bankProfitToHouseholds`. These are proposals that need owner approval.
