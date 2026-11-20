# HEARTLAND economic engine (standalone prototype)

A deterministic, serializable, offline world-economy simulation in plain TypeScript, built to be dropped into HEARTLAND later. It is **isolated**: nothing outside this folder was changed, the game does not use it yet, and every number in it is a **provisional proposal awaiting owner approval**.

* Design and assumptions: [`ECONOMY_DESIGN.md`](ECONOMY_DESIGN.md)
* How the game should use it: [`ECONOMY_INTEGRATION.md`](ECONOMY_INTEGRATION.md)
* Decisions the owner must make: [`DECISIONS_REQUIRING_APPROVAL.md`](DECISIONS_REQUIRING_APPROVAL.md)
* Generated evidence: [`reports/`](reports/) (scenarios, stability, browser benchmark, test results, configuration reference)

## What it does

Nine-country, eleven-zone fictional test world with seven goods (food, energy, materials, industrial, consumer, military, services): production with intermediate inputs, households, prices, wages, international trade with freight, tariffs, sector sanctions and blockades, strategic reserves, private investment with construction delays, taxes, deficits, debt and credit markets, sovereign default, political stability and regime change. One turn = one week; **no maximum number of turns**.

## Commands (Node ≥ 22.12; no install needed to run tests)

```bash
cd economy-engine
npm test                                  # 82 fast tests, ≈25 s (includes all 10 mandatory scenarios)
npm run test:long                         # 10,000 consecutive weeks + save/restore check
npm run typecheck                         # strict TypeScript (uses the game's node_modules TypeScript)
npm run scenarios                         # the ten mandatory scenarios → reports/SCENARIO_REPORTS.md
npm run stress                            # 100…100,000 weeks on three worlds → reports/STABILITY_REPORT.md
npm run stress -- 1000000 --growing-only  # 1,000,000 weeks → reports/STABILITY_REPORT_LONG.md (≈9 min)
npm run bench:browser                     # headless Chromium, CPU-throttled → reports/BROWSER_BENCHMARK.md
npm run sim -- --turns 5200 --every 520   # standalone simulator: any number of turns
npm run sim -- --turns 100000 --save /tmp/world.json
npm run sim -- --load /tmp/world.json --turns 52 --audit
npm run config-reference                  # regenerates reports/CONFIG_REFERENCE.md
```

## Using it

```ts
import { createEconomy, createTestWorldSpec, advanceEconomy, autopilotCommands, serializeEconomy } from './src/index.ts';

let state = createEconomy(createTestWorldSpec(2401));           // ≈0.25 s, once
const result = advanceEconomy(state, {
  commands: [...autopilotCommands(state), { type: 'set-tax', countryId: 'norland', tax: 'income', rate: 0.2 }],
  effects:  [{ type: 'production-shock', zoneId: 'verdania', goodId: 'food', factor: 0.5, recoveryWeeks: 78 }],
}, { audit: true });                                             // pure: state is untouched
state = result.state;                                            // result.report has everything the UI needs
const save = serializeEconomy(state);                            // plain JSON string
```

A worked adapter for the game's existing three-country fixture is in [`examples/heartland-adapter.ts`](examples/heartland-adapter.ts) (compiled and tested).

## Layout

```
src/index.ts            the only file the game should import
src/types.ts            all data contracts
src/config/defaults.ts  goods, recipes and every parameter
src/core/               the weekly turn (finance, planning, market, production, politics, …)
src/world/              world builder/calibration and fictional test worlds
src/ai/autopilot.ts     rule-based fiscal governments for AI countries
sim/                    simulator CLI, scenarios, stress and benchmark tools
tests/                  automated tests          examples/   host adapter example
reports/                generated reports
```

## Suggested STATUS.md entry (not applied: the game's docs were left untouched)

> **Economic engine prototype** (`economy-engine/`, branch `feature/economy-engine`): standalone and unintegrated. Verified by automated tests, ten scenarios and long-run stress runs described in `economy-engine/reports/`. Not verified on a physical iPhone/Safari. All parameters are provisional; see `DECISIONS_REQUIRING_APPROVAL.md`.
