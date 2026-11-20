# ECON-05: economic engine prepared for game integration

Status: **done on branch `feature/economy-engine-integration` (based on the Milestone 4 commit `eb8a00e`), awaiting owner review.**
- Nothing outside `economy-engine/` was changed; the game's `src/game` files are only read by one test.
- The game does not use the API yet.
- No gameplay mechanic was added. The engine was not rewritten: its only change is a per-region output list in the weekly report (needed for production by region) and a loader for already-parsed saves.

## 1. Deliverables

| Deliverable | Where |
|---|---|
| Documented integration API | `src/integration/index.ts` (the only file the game should import). Reference: [`INTEGRATION_API.md`](INTEGRATION_API.md) §1–3. |
| Working example on the fictional scenario | [`examples/fictional-game.ts`](examples/fictional-game.ts), `npm run example` |
| Country/region mapping specification | `INTEGRATION_API.md` §4; code in `src/integration/scenario.ts` |
| One authoritative economy, migration strategy, shared weekly turn | `INTEGRATION_API.md` §5 |
| Automated tests | `tests/integration.test.ts` (13 tests) |
| Benchmark results | §3 below; `reports/INTEGRATION_BENCHMARK.md` (`npm run bench:integration`) |
| Instructions for Codex | `INTEGRATION_API.md` §7 |
| Remaining limitations | §4 below and `INTEGRATION_API.md` §8 |

### What the API provides

One economy session per game. It is pure and atomic, like the game's `advanceTurn`, and its week numbers equal the game's.

| Function | Purpose |
|---|---|
| `createEconomySession(gameState)` | The game's own countries and regions, on the 10 sectors and 31-good catalogue, with the same identifiers |
| `getCountryEconomy` / `getRegionEconomy` | GDP, growth, inflation, unemployment, stability; revenue, expenditure, treasury, debt; central bank; production, capacity and shortages per sector and region; occupation state |
| `checkEconomyCommands` | Validates the player's commands without running anything |
| `advanceEconomyWeek` | Player commands, `regionControl` (captures become occupations) and effects for one week; everything else run by the autopilot |
| `session.summary.events` and `playerRegimeFell` | Weekly events and the defeat flag |
| `saveEconomySession` / `loadEconomySession` / `economyFingerprint` | Save, restore and fingerprint |
| `legacyEconomyView` | Feeds the current three-tile economy panel during the migration |

The older example adapter (`examples/heartland-adapter.ts`, on the 7-good world) was replaced by this API, so there is one integration path, not two. Its tests moved to `tests/integration.test.ts`.

## 2. Tests and checks (all run on the final code)

| Check | Result |
|---|---|
| Type-check (full and core-only) | pass |
| Engine fast suite `npm test` | **181 / 181 pass**: 174 before, minus the 6 tests of the retired adapter, plus 13 integration tests |
| Engine long test (10,000 weeks) | pass |
| Ten mandatory scenarios | 10 / 10; results unchanged (only run times differ) |
| Full report `npm run test:report` | **all checks pass**, including the game's 63 tests and its production build `npm run build` |
| Golden fingerprint | unchanged (`6f9bf1a361044b05`): the engine's behaviour did not change |
| Worked example `npm run example` | runs; the fingerprint is identical after save and load |

The integration tests cover each required area:

| Area | What is tested |
|---|---|
| Initialisation | 3 countries, 6 regions, 31 goods, 10 sectors; game week 1; player and AI controllers; positive, finite figures |
| Country and region mapping | On the **real** `createInitialState()` / `selectCountry()`: same ids and owners, 7 roads for the 7 adjacent pairs. The copy used by the example matches. Explicit errors for a missing profile, an unknown owner, asymmetric adjacency, duplicate ids, a country without regions, and an unknown player. |
| Consistency of indicators | Treasury and debt equal the engine's. Balance = revenue − expenditure. A country's sector output is exactly the sum of its regions'. Population is consistent. Growth is defined after half a year. Central-bank figures are present. |
| Economic commands | Tax, spending and public-firm objective take effect. Checking changes nothing. A wrong rate, another country's order and an unknown tax are refused with reasons. |
| Weekly advancement | Pure (the input is untouched), deterministic (two runs are identical), and week numbers advance |
| Save/load determinism | The restored session shows the same figures and continues bit-identically for 30 weeks. Damaged saves are refused (bad JSON, foreign format, mismatched summary, corrupt economy). |
| No double counting | Every week for a year, each treasury changes by exactly revenue − expenditure + borrowing − repayment (rounding error at most 1.4e-14), and the legacy panel numbers are the same money, not a second treasury |
| Invalid commands and rollback | An invalid rate after a valid one, another country's default, an unknown region, an invalid effect, and no player country: each is refused, the session is unchanged, and the next valid week is identical to a run in which the refused attempts never happened |
| Also tested | A capture becomes an occupation and the recapture a liberation; the player's first regime change is flagged as defeat; ten years of the fictional game stay sane; importing the API runs no code |

**Defect found and fixed by these tests.** A country's population was reported from the start of the week, while its regions' populations were from the end of the week, so the two disagreed slightly. The country figure is now the sum of its regions.

## 3. Benchmarks

**Integration API, fictional scenario**, headless Chromium with CPU throttling, a proxy for a phone:

| | 1× | 4× | 6× |
|---|---:|---:|---:|
| Create a session | 0.48 s | 1.4 s | 2.2 s |
| One week, median | 1.5 ms | 3.9 ms | 9.0 ms |
| One week, worst | 12 ms | 51 ms | 90 ms |
| 155 weeks in total | 0.35 s | 0.86 s | 1.7 s |
| Save / load | 1.3 / 2.6 ms | 7.3 / 8.2 ms | 15 / 21 ms |

- **Size:** the save is 296 KB after 156 weeks. The bundle the game would load lazily is 147 KB minified (48 KB gzip).
- **Determinism:** the fingerprint is identical at every throttle level.
- **API overhead:** the wrapper costs about 15% on top of the engine's weekly cost (2.6 ms against 2.3 ms in Node). That is the state copy that makes a week atomic plus the weekly summary.

**Engine benchmarks** (`reports/BENCHMARK.md`, `reports/BROWSER_BENCHMARK.md`) were re-run. There is no change from Milestone 4 beyond timing noise, because the engine's simulation code was not touched.

## 4. Remaining limitations

- **Integration not done.** The game does not use the API yet, and T06 still runs in the game. Replacing it needs owner decision A1.
- **Invented regional data.** The six region profiles are invented illustrations, and road distances and lane capacities are provisional. The six real playable countries were not created, as instructed.
- **Starting adjustment.** The first weeks show a price adjustment: annualised inflation of about 7–11% in week 1, about 4–5% after a year. Growth is hidden until half a year is on record.
- **Creation time.** Creating a session takes about 2 s on a slow-phone proxy. A pre-built week-1 save (about 20 ms to load) or a worker is recommended but not done.
- **AI countries** use only the fiscal autopilot.
- **Policy mapping.** The old `standard` / `tax-relief` policy has no assumed mapping onto tax rates; this is an owner decision.
- **Money units.** Illustrative units with decimals and one shared currency (R36 not implemented).
- **Not measured on an iPhone or in Safari.**

## 5. Decisions for the owner

1. **A1:** may the engine replace the game's T06 treasury rule (deficits, borrowing and default instead of refused weeks)? This is the condition for removing the duplicated economy.
2. How should the existing `standard` / `tax-relief` policy translate into tax rates, or should it be retired in favour of direct tax and spending controls?
3. Should a pre-built week-1 save of the fictional scenario ship with the game, for an instant start on phones?
4. Should a capture always mean occupation (the current mapping), with annexation only through a future peace settlement?

## 6. Proposed next step (for approval; nothing implemented)

**Codex task: the bridge and a read-only economy panel** (steps 1–3 of `INTEGRATION_API.md` §7):
- `src/game/economyBridge.ts`, implementing the combined atomic weekly turn;
- lazy creation of the session when a game starts;
- the player country's indicators shown in the existing panel style on iPhone.

It should contain no new controls and no removal of T06 until decision 1.
