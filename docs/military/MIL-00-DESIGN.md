# MIL-00-DESIGN · Strategic land combat

**For owner review.** Proposed rules and parameters require approval before gameplay implementation. Baseline main is `0894d8213ac06b3ed418b7cf4b12ce68c2bdbc15`. MIL-01A remains separate in PR #39.

## Existing architecture and accepted baseline

- `src/game/military.ts` resolves player orders by division ID and allocates defender losses by ID. Each attacker and its defenders calculate damage from pre-round strength, then the next attacker sees the modified state. The provisional damage rules are half attacker strength and one-quarter defender strength with integer rounding. An attack persists until capture, destruction, replacement or invalidation. Capture requires surviving attackers and complete depletion of the garrison. WORLD-04 reproduced a lone attacker losing 75% in the first week against three full divisions. [WORLD-04 combat study](../world/WORLD-04-COMBAT-STUDY.md)
- `advanceTurn.ts` validates and applies commands before military resolution. `economyBridge.ts` routes the turn through `advanceWeekTogether`, settling economic occupation from the resulting regional controller while retaining legal ownership. `saveFormat.ts` and `saveValidation.ts` verify the checksummed checkpoint against the scenario fixture and economy. The current Military overview surfaces continuing orders and the weekly report lists completed results. [WORLD-04 iPhone corrections](../world/WORLD-04-IPHONE-CORRECTIONS.md)
- The owner accepted WORLD-04-FINAL on iPhone SE (2022), iOS 26.2, and approved two physical benchmark runs. PRs #36 and #38 are merged. Each benchmark ran 156 turns, 61 economic zones and 90 divisions.

| Physical baseline | Run 1 | Run 2 | Target |
|---|---:|---:|---:|
| Start | 415 ms | 524 ms | 1,000 ms |
| Median weekly settlement | 19 ms | 19 ms | 250 ms |
| P95 weekly settlement | 75 ms | 75 ms | 500 ms |
| Slowest weekly settlement | 156 ms | 158 ms | 1,000 ms |
| Save and restore | 141 ms | 139 ms | 1,000 ms |

## Alternatives

| Criterion | A · Strength and retreat | B · Coordinated engagement and progress | C · Readiness, equipment and logistics |
|---|---|---|---|
| Strategic depth | Commit manpower and choose when to leave | Commit across regions, reinforce and manage persistent pressure | Multiple resource and readiness tradeoffs |
| Balance | Few knobs, strong dependence on headcount | Attrition, tempo and terrain can be tuned separately | More interactions to calibrate, with risk of runaway advantages |
| Predictability | High with known strength | Visible trend and bounded losses, with uncertain enemy strength | More hidden inputs and harder attribution |
| Mobile interface | A single comparison and retreat button | One engagement card with detail on demand | Several resource and readiness indicators |
| AI | Ratio gate and fallback | Ratio bands, reliable fallback and reserve decisions | Cross-front resource allocation and longer lookahead |
| Multiplayer determinism | Simple with snapshot aggregation | Explicit conflict policy, fixed arithmetic and atomic settlement | More allocation and dependency order to specify |
| Saves | Rules version and existing standing orders | Add persistent engagements and their participation/outcomes | Track supplies, equipment and readiness over time |
| Performance | Linear scan of participating divisions | Indexed regional groups and local edge checks | Potential route and logistics recomputation |
| Naval and amphibious extension | Separate progress and arrival semantics would be needed | Contested arrival can feed an engagement from a future beachhead | Rich integration once naval and logistics systems exist |

**Recommendation: B.** Engagements lasting several weeks give players time to respond without issuing the same order every turn. Use personnel equivalents as the only division strength input in the first phase, with 25,000 as full strength. Show effectiveness as the remaining share of full strength and use operational statuses to convey when a unit cannot fight. Separate morale and equipment would increase save and interface complexity before testing has identified a need. In a 156-week match that lasts two hours, each week gets about 46 seconds on average. Keep key decisions on the overview and require a tap only to change an order or see details.

## Proposed rules

1. A land assault groups eligible attacks against a region by conflict side. Track one engagement at that target against its current controller. Store each attacker's origin and aggregate all participating divisions before calculating anything. Apply losses once per division from the same snapshot. Incoming orders from several origins add force with no initial direction bonus. Reinforcements join in their eligible settlement week. They bring strength and increase that side's committed-strength baseline by their joining strength, with no reset to progress. A departure removes that participant's baseline contribution and surviving strength. A unit rejoining contributes its current strength, subject to the re-entry policy below.
2. Use integer arithmetic. Start progress at zero and bound it to −100 through +100. Let A and D be the participating sums after bounded modifiers. Start with D = floor(defender strength × 115 ÷ 100). Progress changes by the sign of A−D times floor(45 × |A−D| ÷ (A+D)). Handle an empty side before doing any division. Each unit loses the floor of its manpower times its side’s loss rate. In basis points the rates are min(600, floor(300 × D ÷ A)) for attackers and min(600, floor(300 × A ÷ D)) for defenders. Round per unit without redistributing remainders. Check multiplication bounds and ensure zero ordinary loss remains possible at very small strengths. An uncontested eligible land advance may capture in the same settlement.
3. An attacker is **defeated** when stopped at −100 progress or at or below 70% of committed strength. Its surviving divisions disengage to their eligible origin. Defenders at +100 progress or at or below 70% attempt **retreat** to a friendly-controlled, uncontested adjacent region reachable by military land edges at settlement. Voluntary disengagement uses the same eligibility checks and applies before losses for the week. A player can name a preferred eligible fallback. With several eligible fallbacks and no usable preference, choose by an explicit map policy, such as shortest distance to a friendly reserve and a stable region key for equal candidates. Mark retreating units unavailable for combat until the next settlement. Consider one further week before re-entry to discourage withdrawal and immediate recommitment for a fresh baseline.
4. A division reaching the loss threshold has reduced **combat effectiveness** and may be repelled with personnel remaining. If the origin is no longer usable or a defender's fallback is blocked by another engagement, keep the formation pinned, recheck next week and expose the reason. Confirm **encirclement** only if there is no eligible friendly land exit structurally at settlement. The candidate surrender rule requires two consecutive qualifying weeks while encircled and facing a breakthrough or low strength. A successful exit or loss of the qualifying condition resets the count. **Surrender** ends the formation's participation and records surviving personnel as captured separately from casualties. **Destruction** would mean the formation and surviving personnel are lost as an explicit exceptional outcome. Leave it disabled in the first implementation. Normal weekly combat cannot cause it. Apply the same withdrawal classification to an attacker whose origin is invalidated, and require owner approval of symmetric surrender before enabling it.
5. Capture after defenders withdraw, surrender or are absent requires an eligible surviving attacking occupation force. Keep ownership unchanged while defenders are pinned or while claimants dispute the result. On capture, place the winning participating force in the province, end those commitments and emit one control change. Defeat or a voluntary attacker withdrawal without a capture leaves territorial control unchanged. Failed voluntary withdrawal should produce a report entry and show the unit's current commitment.

### Concurrent fronts and determinism

Freeze diplomacy, owners, orders and placements for the week before assessing commitments. A division in a region targeted this week stays available for local defence and holds its outgoing assault or movement. Evaluate this from legal incoming intents before applying holds. Reciprocal assaults can therefore both hold. Surface the reason and allow a new order the next week. This conservative policy avoids double use of a division but allows a small attack to delay an outgoing force. Test repeated blocking and seek owner approval for any minimum threat gate before adding it. Distinct fronts settle in parallel. Either validate one consolidated command per unit per seat or reject conflicts, keeping draft replacement in the UI. Independent command permutations and renamed division IDs must yield equivalent state, losses and reports after remapping references. Use durable IDs for references and display only.

Existing basic diplomacy supplies the first eligibility policy. Future formal hostilities, shared command or alliances can supply explicit attack, defence and access permissions at the same boundary. Initially allow one attacking side per target. If unrelated sides submit competing claims, defer their assaults at that target for the week and report the contention, with no arbitrary winner or pooled coalition. Recheck fallback against contested regions and proposed captures before a single commit. Friendly units arriving via normal movement are available for combat the following week. An explicitly staged reinforcement joins the named verified engagement and cannot fight anywhere else that week.

## Synthetic calibration

Run from the repository root with Python 3.10 or later.

```sh
python3 docs/military/tools/mil00_calibrate.py
```

The study uses abstract regions and integer personnel equivalents. A and D columns show attacker/defender totals. Full divisions start with 25,000 each unless specified. The voluntary withdrawal settles in week 3 after two combat rounds. A 12-week stop is an observation window. Survivors from a surrendered garrison appear in the prisoners column. The harness models fallback eligibility as a fixture input and tests separate simultaneous fronts and reciprocal holds. Full map retreat selection, competing third parties, save/replay and UI are implementation acceptance tests.

| Case | Week | Losses A / D | Remaining A / D | Prisoners | Progress | Territory |
|---|---:|---:|---:|---:|---:|---|
| 1 vs 1 | 10 | 7,691 / 5,561 | 17,309 / 19,439 | 0 | −37 | Held, attacker repelled |
| 1 vs 2 | 6 | 7,751 / 3,350 | 17,249 / 46,650 | 0 | −100 | Held, attacker repelled |
| 1 vs 3 | 4 | 5,480 / 2,367 | 19,520 / 72,633 | 0 | −100 | Held, attacker repelled |
| 2 vs 2 | 10 | 15,382 / 11,122 | 34,618 / 38,878 | 0 | −37 | Held, attacker repelled |
| 3 vs 1 | 5 | 3,798 / 6,651 | 71,202 / 18,349 | 0 | +100 | Captured after retreat |
| 3 vs 2 | 9 | 13,188 / 16,104 | 61,812 / 33,896 | 0 | +65 | Captured after retreat |
| 16,000 vs 25,000 | 6 | 4,822 / 2,168 | 11,178 / 22,832 | 0 | −87 | Held, attacker repelled |
| 1 vs 1, three attacker reinforcements in week 3 | 7 | 5,296 / 7,588 | 94,704 / 17,412 | 0 | +100 | Captured after retreat |
| 1 vs 1, attacker withdraws in week 3 | 3 | 1,702 / 1,278 | 23,298 / 23,722 | 0 | −6 | Held, withdrawal |
| 3 vs 2, two attack directions | 9 | 13,188 / 16,104 | 61,812 / 33,896 | 0 | +65 | Captured after retreat |
| 3 vs 1, encircled | 6 | 4,422 / 7,751 | 70,578 / 0 | 17,249 | +100 | Captured after surrender |
| 3 vs 1, fallback contested | 12 | 7,464 / 13,097 | 67,536 / 11,903 | 0 | +100 | Held, pinned at cutoff |

Independent simultaneous 1 vs 1 fronts each matched the first table row in both submission orders. Reciprocal assaults held before combat in both orders, with zero casualties and unchanged control. The convergence result matched under all 72 combinations of attacker renaming, command ordering and defender ordering.

| Changed setting, one at a time | 1 vs 1 | 3 vs 2 |
|---|---|---|
| Defence 100% | Attacker repelled, week 12 | Capture, week 8 |
| Defence 130% | Attacker repelled, week 9 | Capture, week 10 |
| Base loss 2% | Ongoing, week 12 | Ongoing, week 12 |
| Base loss 4% | Attacker repelled, week 8 | Capture, week 7 |
| Retreat threshold 80% remaining | Attacker repelled, week 7 | Capture, week 6 |
| Progress pace 35 | Attacker repelled, week 10 | Capture, week 9 |

Higher retreat thresholds shorten fights and preserve more survivors. At 80%, the 3 vs 2 attacker loses 9,351 instead of the baseline 13,188. Lowering losses to 2% while keeping the other rules prolongs both sampled engagements beyond the cutoff. Even baseline attrition accumulates to about 31% for the 1 vs 1 attacker. Before adoption, playtest whether repeated contests consume too much strength across 52/104/156 weeks. Equal forces on terrain with no modifier can leave progress at zero while the attacker's commitment fails first when both hit their thresholds. A persistently blocked fall-back can keep a fight going after breakthrough. These are open balance decisions.

## State, APIs and system boundaries

- Add a pinned match-level combat rules ID, with `legacy-t07` and a candidate `strategic-land-v1`. Add a versioned engagement record with target, defender/controller, conflict side, start and last settled week, phase, signed progress, participants and origins, committed strength per participant, and encirclement count. Keep manpower on each division and its commitment singular. Save pending per-seat orders and relevant completed results, with deterministic event keys and bounded report history. Closing an engagement clears its active references and writes a typed outcome.
- Extend commands additively with commitment, reinforcement and disengagement intents plus expected execution week and optional fallback. A pure resolver takes the frozen snapshot and returns proposed unit, engagement and control updates plus report events. Validate control, unique use of each division, eligibility and ownership together before producing the in-memory commit. Feed only final control changes into atomic economy settlement. A rejected economy or game turn keeps the previous reports, save and drafts intact.
- Keep the existing save format decoder and scenario/economy fingerprint checks. A missing combat rules ID means legacy T07 on both fictional and exact-version European saves, including mid-attack sessions. Only new matches offered the new rules select them at creation. Preserve legacy standing orders, economic values and outcomes on replay. Keep immutable scenario packages byte-for-byte. Add a versioned SAVE-01 strategy checkpoint payload with discriminated validation for rules, bounded values, references, phases, drafts, ownership, week and engagement consistency. Reject unsupported rules or incompatible versions without replacing the existing save. Any future conversion requires an explicit owner decision and separate slot or export. Preserve transaction receipt timing, stale-tab protection and review origin isolation.
- For two to four human seats, normalize validated private submissions into one immutable weekly bundle. A future authoritative settler applies it once per week and makes retries idempotent. Resolve simultaneous diplomacy before freezing eligibility, then settle military, control and economy atomically. The local player uses the same command contract. Start AI with conservative risk bands, a reserve and fallback check, and deterministic reinforcement and stop thresholds. AI sees its own forces and the same authorized enemy information as players.
- MIL-01A units in maritime journeys have no regional presence for combat, occupation or fallback. Friendly arrivals and MIL-01C authorized allied arrivals become eligible under their arrival and permission rules. MIL-01B transit supplies location/access constraints without conferring presence for occupation or automatic defence. Revalidate landing, staging and transit permissions when used. Keep PR #39’s separate save design review independent.
- MIL-02 can supply bounded modifiers and resupply effects at the frozen input boundary. MIL-03 can supply naval route and arrival events, escorts, interception and blockades. Mandatory MIL-04 adds hostile coastal arrival, contested combat, configurable landing penalties and a separate temporary beachhead state, with maritime supply, reinforcement and evacuation. Arrival creates an eligible contingent at a beachhead under the rules for that operation. Provincial control changes only through resolved combat and occupation. Future air actions can contribute bounded modifiers or separate arrival events. None of these extensions is required for the first land phase.

## Player experience

- Show a compact **Pending orders** row with the execution week beside the staging action. Show origin, target, own strength and intended persistence in its confirmation. A pending order can be removed with no combat effect.
- Put **Active engagements** first in the Military overview. Show target, friendly committed strength, change this week, a progress label such as **Holding** or **Gaining ground**, and **Reinforce** and **Stage disengagement** actions. Show enemy strength only if authorized, with a range or last-observed week where applicable. If observations are unavailable, say so and omit numerical ratios. Derive any risk band solely from information the viewer is allowed to see. Exact internal progress can disclose hidden force changes, so use coarse, authorized progress observations and test the view for leaks.
- In the detail sheet show each division, remaining personnel and percentage of full strength, last own losses and attempted fallback. State when disengagement settles and what happens if the exit closes. On settlement, clearly distinguish repelled with survivors, retreat destination, pinned, surrendered, captured territory and destruction if later approved. Show only authorized enemy outcomes. Use text plus icons, large touch targets and no color-only states. Link the weekly report to the engagement and return to the overview when the report closes, in portrait and landscape.

## Roadmap and acceptance

1. **Rules and synthetic engine.** Approve numbers and conflict policy, then implement the pure resolver and deterministic fixtures. Test every calibration case, safe arithmetic, weak formations, concurrent moves and exits, cancelled and conflicting drafts, competing sides, blocked retreats that reopen, repeated reciprocal holds, and capture with survivors. Test division renaming and command permutations across canonical snapshots and report events. Test that every division fights at most once per week and embarked units never participate.
2. **Atomic integration and legacy saves.** Select rules at new-match creation in a review fixture, prove exact replay for legacy fictional and European checkpoints, and test new mid-engagement saves with reinforcement, withdrawal, capture and a pending draft. Test atomic failure after proposed occupation, matching economy control and legal ownership, and unsupported versions preserving the checkpoint. Run full game and engine tests, typechecks and builds. Preserve package fingerprints and existing licensing/distribution checks.
3. **Mobile and performance review.** Test Chromium and WebKit where installed, then physically retest on the owner’s iPhone. Stage an attack, advance from the order sheet, close the report and find **Continuing attacks** or its active-engagement successor without another navigation step. Verify timing, strength, stop, persisted stop and no next-week attack. Also test reinforcement, reports, save receipts and hidden intelligence in portrait and landscape. Keep GAME-UX-01 and its existing timeout unchanged and document any intermittent Week 2 failure. Measure calm and heavy-engagement 156-week runs with 61 zones and 90 divisions, including save/restore. Use the baseline thresholds above. Index units by region and traverse eligible local edges so weekly grouping and retreat eligibility scale with units and the relevant graph edges. Compare both measured timings and checkpoint size before requesting adoption.
4. **Later integration.** Review MIL-01A/B/C compatibility separately, then validate logistics, naval and mandatory amphibious operation integration along the approved roadmap. No prerequisite to merge PR #39 for the land design.

## Owner approvals before coding

- Confirm B, the eligible new-match rollout, and preservation of both legacy rulesets and immutable scenarios. Confirm the initial military authorization scope under current diplomacy.
- Approve starting values or choose within the study ranges. Candidate base loss 3% (2–4% tested), weekly cap 6%, defence 115% (100–130% tested), progress pace 45 (35–45 tested), retreat at 70% remaining (70–80% tested), and breakthrough at +100. Approve modest terrain bands and whether authoring their classifications should require a separate scenario release.
- Approve threshold ties, stalemate duration or pause, reciprocal holds and competing-side policy, reinforcement baselines, and post-retreat re-entry timing. Decide whether a repeatedly pinned but temporarily blocked formation needs a ceasefire or other stopping rule.
- Approve preferred fallback and tie handling, the two-week encirclement candidate, whether attacker surrender is symmetric, and the disposition of captured formations. Keep exceptional destruction disabled initially unless a later separately approved rule defines it.
- Approve enemy intelligence granularity, which progress information is public, and whether to keep morale and equipment deferred until a later milestone.
