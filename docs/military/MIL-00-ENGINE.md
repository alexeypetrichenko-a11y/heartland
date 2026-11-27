# MIL-00-ENGINE · Engine review

Based on main `6f41cdcb43bd60646e2114eb50327ce9f92d589d` and the approved MIL-00-DESIGN calibration and safeguards.

## Integration

- `startStrategicLand` pins `strategic-land-v1` at new-match creation. The current match picker continues to start legacy matches until the interface is integrated. The same weekly game/economy boundary settles both rulesets. It commits game and economic results together. A failed turn keeps the existing state and draft.
- `stageCollective`, `collectivePreview`, and `collectiveReasons` support attacks, moves, defence, reinforcement and disengagement. A staged replacement removes an entire overlapping bundle only after the new bundle passes validation. Settlement rejects overlapping or invalid bundles without changing existing engagement membership. The local turn entry point authorizes the selected country. The pure resolver also accepts an authorized multiple-country bundle for future multiplayer.
- Each active front records its sides, progress, rounds and withdrawal status. Assignment and casualties use shared snapshots. A division participates at most once. Control changes are committed together. The engine records surviving prisoners separately from ordinary casualties. An unavailable withdrawal route can suspend a front without recurring losses. If the route reopens, withdrawal settles first. A new order is needed to attack after a suspended engagement ends.
- `militarySelection` and `militaryEvents` return viewer-owned data. The land resolver accepts a presence predicate for future journey state. MIL-01A must supply it at the game adapter when joining the standalone mobility branch. The strategic state introduced here does not depend on the map, renderer, future supply system or a transport implementation.
- SAVE-01 writes unchanged legacy version 1 envelopes for legacy matches and a version 2 envelope for strategic matches. Older clients reject version 2. Existing scenario identity and economy fingerprint checks apply to both. Exact-version scenario packages remain immutable.
- MIL-00R can update available personnel, retained readiness and recommitment eligibility through a future explicit settlement step. MIL-00-ENGINE preserves those values across orders and saves. It does not replenish units or charge a budget. GEO-01 and MIL-00-UX should share bundle selection and preview, pass confirmation before replacing an existing bundle, display restricted viewer events, and adapt the pending/active/report UI. Retest Continuing attacks when that interface lands.

## Calibration and exhaustion

The TypeScript resolver reproduces the approved six principal cases, including multi-origin orders and renamed/reordered divisions.

| Forces | Weeks | Attacker / defender losses | Outcome |
|---|---:|---:|---|
| 1 vs 1 | 7 | 5,583 / 4,102 | Repelled |
| 1 vs 2 | 4 | 5,480 / 2,372 | Repelled |
| 1 vs 3 | 4 | 5,480 / 2,367 | Repelled |
| 2 vs 2 | 7 | 11,166 / 8,204 | Repelled |
| 3 vs 1 | 4 | 3,132 / 5,480 | Capture after retreat |
| 3 vs 2 | 6 | 9,351 / 11,078 | Capture after retreat |

The focused suite also covers screen-out versus clash at the exact 25% boundary, the eight-round limit, simultaneous captures from exposed origins, reinforcement progress, a full recovery week, escalation from blocked withdrawal to suspension, reopened routes, symmetric surrender, prisoners, collective replacement and rejection, ownership-gated views, a mock embarked unit, and active/suspended save replay. It injects a failure after military settlement and verifies the original combined state is unchanged. The standalone Python calibration covers 72 ID/order permutations and sensitivity cases.

In the 156-week Europe heavy-order run, nine of 90 formations were depleted or surrendered at each of weeks 52, 104 and 156. The calm run had zero at all three checkpoints. A separate sustained eligibility check shows a repelled formation stays at 19,417 of 25,000 personnel and cannot re-attack at any of the three horizons. Long matches can permanently lose offensive capacity, even with many surviving personnel. The benchmark stops finding legitimate orders as forces exhaust and borders change. It had seven weeks with an active front and at most two concurrent fronts. It measures concentrated combat within a 156-week campaign. Sustained heavy pressure requires additional fixtures or approved replenishment.

## Local verification

Run `npm test`, `npm --prefix economy-engine test`, `npm --prefix economy-engine run test:long`, `npm --prefix economy-engine run typecheck`, `npm run build`, and `npm run build -- --mode world04-local`. Run `python3 docs/military/tools/mil00_calibrate.py` for the design calibration. Run `node scripts/economy/bench_mil00_node.ts` for the desktop test. The Node benchmark reads only the immutable draft.3 and verifies game/economy round-trip and the 90-division/61-zone roster.

For a local browser benchmark, generate the benchmark page with `node scripts/economy/bench_world04.cjs` after the review build. Serve the review output with Vite preview and open `/heartland/benchmark.html?mil00` on that origin. For local Chromium automation, run `node scripts/economy/bench_world04.cjs --browser --mil00`; `HEARTLAND_BENCH_ORIGIN` can point to the running review server. The benchmark runs at native speed and with 6× CPU throttling. Neither substitutes for physical Safari acceptance.

## Verification results

- Game tests 182/182, including 17 MIL-00 cases. Economy tests 218/218 and the 10,000-week economy test passed.
- App and economy typechecks passed. Production and local review builds passed. The artifact audit found zero scenario package assets in the standard build and exactly eight allowlisted draft.3 assets in the review build.
- SAVE-01 passed in Chromium portrait and landscape. GAME-UX-01 passed at all four tested sizes and on restored defeat. The original browser tests and timeouts are intact. Its known intermittent Week 2 timeout remains documented in the WORLD-04 review.
- The Python calibration passed its deterministic permutations and safeguard assertions. The integrated TypeScript tests reproduced six force-ratio cases, preserved legacy replay and validated strategic active and suspended saves.
- Full-map movement, occupancy and route authorization for future transport, allied staging and multiplayer still depend on those features. The physical-device benchmark and integrated collective order interface are pending.

## Benchmark measurements

All values are milliseconds for 156 turns with 61 economic zones and 90 divisions. These measurements were collected on the development host while other validation jobs were running. The physical reference values are from the earlier WORLD-04 acceptance on iPhone SE (2022), iOS 26.2 Safari.

| Environment and workload | Start | Median | P95 | Max | Save and restore |
|---|---:|---:|---:|---:|---:|
| Acceptance threshold | 1,000 | 250 | 500 | 1,000 | 1,000 |
| Desktop Node, calm | 296 | 130 | 400 | 988 | 398 |
| Desktop Node, heavy orders | 90 | 188 | 349 | 458 | 571 |
| Desktop Chromium, calm | 347 | 29 | 117 | 266 | 133 |
| Desktop Chromium, heavy orders | 217 | 35 | 109 | 337 | 303 |
| Chromium with 6× CPU throttle, calm | 518 | 175 | 310 | **1,165** | **1,750** |
| Chromium with 6× CPU throttle, heavy orders | 417 | 186 | 330 | 651 | 978 |
| Physical Safari, WORLD-04 baseline | 415–524 | 19 | 75 | 156–158 | 139–141 |
| Physical Safari, MIL-00-ENGINE calm | 554 | 19 | 75 | 164 | 164 |
| Physical Safari, MIL-00-ENGINE heavy orders | 413 | 31 | 77 | 190 | 170 |

The throttled calm run exceeded the maximum-turn and save/restore thresholds. Keep the acceptance limits and repeat on the reference iPhone before rollout. Save checkpoint sizes were 2,545,097 bytes in the calm case and 2,545,183 bytes in the heavy-order case.

## Final acceptance fixture

The separate synthetic fixture exercises 475 divisions, 16 simultaneous fronts, seven consecutive active weeks, a 24-division collective selection, four reinforcement and withdrawal rounds, and a blocked front whose exit becomes available when the adjacent attack disengages. It round-trips several live fronts through JSON and the game save validator using its own fixture. The existing SAVE-01 envelope tests cover active and suspended saves with economy state. A separate test verifies that a simultaneous capture prevents withdrawal to that destination. No production strength regeneration is involved.

The owner benchmark is a separate static page. It starts a fresh in-memory session for each mode and measures checkpoint serialization and restore without opening browser storage. It displays the commit, all five performance metrics, engagement weeks, peak fronts, checkpoint size, and separate depleted and surrendered counts at 52, 104 and 156 weeks. Generate it from a clean checkout after the standard and local review builds with `node scripts/economy/build_mil00_review.cjs <new-output-directory>`.

The owner accepted the two MIL-00-ENGINE runs on iPhone SE (2022), iOS 26.2 Safari. Both met all five thresholds. The first calm attempt took 4,128 ms to initialize. Its cause remains unconfirmed. The prior CPU-throttled browser limitations above remain part of the record.
